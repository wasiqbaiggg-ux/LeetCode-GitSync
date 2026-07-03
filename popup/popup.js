
// popup.js
// Handles the popup UI for the GitHub integration, including token validation, repository selection/creation, and setup completion.
// This script communicates with background.js to perform GitHub API actions and manages the popup's state transitions.
document.addEventListener('DOMContentLoaded', async () => {
  const badgeStatus = document.getElementById('connection-status');
  const badgeStatusText = badgeStatus.querySelector('.status-text');

  // Panes for different stages of the setup process
  const paneAuth = document.getElementById('pane-auth');
  const paneSetup = document.getElementById('pane-setup');
  const paneDashboard = document.getElementById('pane-dashboard');
  const panes = [paneAuth, paneSetup, paneDashboard];

  // Auth elements
  const inputPat = document.getElementById('input-pat');
  const btnTogglePat = document.getElementById('btn-toggle-pat');
  const btnVerifyToken = document.getElementById('btn-verify-token');
  const authError = document.getElementById('auth-error');

  // Setup elements
  const userAvatar = document.getElementById('user-avatar');
  const githubUsername = document.getElementById('github-username');
  const tabSelectRepo = document.getElementById('tab-select-repo');
  const tabCreateRepo = document.getElementById('tab-create-repo');
  const contentSelectRepo = document.getElementById('content-select-repo');
  const contentCreateRepo = document.getElementById('content-create-repo');
  const selectRepo = document.getElementById('select-repo');
  const inputNewRepoName = document.getElementById('new-repo-name');
  const inputBranch = document.getElementById('input-branch');
  const btnSaveSetup = document.getElementById('btn-save-setup');
  const setupError = document.getElementById('setup-error');

// Dashboard elements
  const dashUsername = document.getElementById('dash-username');
  const dashRepo = document.getElementById('dash-repo');
  const dashBranch = document.getElementById('dash-branch');
  const btnReset = document.getElementById('btn-reset');
// State variables
  let githubUser = null;
  let cachedRepos = [];
  let currentSetupTab = 'select';

  const config = await new Promise((resolve) => {
    chrome.storage.local.get(['githubToken', 'githubUsername', 'githubOwner', 'githubRepo', 'githubBranch'], resolve);
  });

  if (config.githubToken) {
    githubUser = config.githubUsername;
    
    if (config.githubRepo) {
      updateStatus(true);
      showPane(paneDashboard);
      
      dashUsername.textContent = `@${config.githubUsername}`;
      dashRepo.textContent = `${config.githubOwner || config.githubUsername}/${config.githubRepo}`;
      dashRepo.href = `https://github.com/${config.githubOwner || config.githubUsername}/${config.githubRepo}`;
      dashBranch.textContent = config.githubBranch || 'main';
    } else {
      updateStatus(false);
      showPane(paneSetup);
      initializeSetupPane(config.githubToken, config.githubUsername);
    }
  } else {
    updateStatus(false);
    showPane(paneAuth);
  }

  btnTogglePat.addEventListener('click', () => {
    const isPassword = inputPat.type === 'password';
    inputPat.type = isPassword ? 'text' : 'password';
    
    btnTogglePat.innerHTML = isPassword 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
         </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
         </svg>`;
  });

  btnVerifyToken.addEventListener('click', async () => {
    const token = inputPat.value.trim();
    authError.style.display = 'none';

    if (!token) {
      showError(authError, 'Please enter a token.');
      return;
    }

    setLoading(btnVerifyToken, true, 'Verifying...');

    chrome.runtime.sendMessage({ action: 'VALIDATE_TOKEN', token }, async (response) => {
      setLoading(btnVerifyToken, false, 'Verify & Connect');
      
      if (response && response.success) {
        githubUser = response.username;
        
        await chrome.storage.local.set({
          githubToken: token,
          githubUsername: githubUser
        });

        initializeSetupPane(token, githubUser);
        showPane(paneSetup);
      } else {
        showError(authError, response?.error || 'Verification failed. Double check your token.');
      }
    });
  });

  tabSelectRepo.addEventListener('click', () => {
    currentSetupTab = 'select';
    tabSelectRepo.classList.add('active');
    tabCreateRepo.classList.remove('active');
    contentSelectRepo.classList.add('active');
    contentCreateRepo.classList.remove('active');
  });

  tabCreateRepo.addEventListener('click', () => {
    currentSetupTab = 'create';
    tabCreateRepo.classList.add('active');
    tabSelectRepo.classList.remove('active');
    contentCreateRepo.classList.add('active');
    contentSelectRepo.classList.remove('active');
  });

  btnSaveSetup.addEventListener('click', async () => {
    setupError.style.display = 'none';
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['githubToken', 'githubUsername'], resolve);
    });

    const token = config.githubToken;
    const username = config.githubUsername;
    const branchName = inputBranch.value.trim() || 'main';

    let repoName = '';
    // Handles repository selection or creation based on the current setup tab
    if (currentSetupTab === 'select') {
      repoName = selectRepo.value;
      if (!repoName) {
        showError(setupError, 'Please select a repository.');
        return;
      }

      const selectedRepo = cachedRepos.find((repo) => repo.name === repoName);
      const owner = selectedRepo?.owner || username;
      const branchName = inputBranch.value.trim() || selectedRepo?.defaultBranch || 'main';

      await saveSetupAndTransition(username, repoName, branchName, owner);
    } else {
      repoName = inputNewRepoName.value.trim().replace(/[^a-zA-Z0-9-_]/g, '-');
      if (!repoName) {
        showError(setupError, 'Please enter a valid repository name.');
        return;
      }

      setLoading(btnSaveSetup, true, 'Creating repository...');

      chrome.runtime.sendMessage({ action: 'CREATE_REPO', token, repoName }, async (response) => {
        setLoading(btnSaveSetup, false, 'Complete Setup');
        if (response && response.success) {
          const owner = response.repo.owner || username;
          const branchName = response.repo.defaultBranch || inputBranch.value.trim() || 'main';
          await saveSetupAndTransition(username, response.repo.name, branchName, owner);
        } else {
          showError(setupError, response?.error || 'Failed to create repository. Make sure name is unique.');
        }
      });
    }
  });

  btnReset.addEventListener('click', async () => {
    await chrome.storage.local.clear();
    
    inputPat.value = '';
    selectRepo.innerHTML = '<option value="" disabled selected>Loading repositories...</option>';
    inputNewRepoName.value = '';
    inputBranch.value = 'main';
    
    updateStatus(false);
    showPane(paneAuth);
  });

  function showPane(activePane) {
    panes.forEach(pane => {
      if (pane === activePane) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });
  }

  function updateStatus(isConnected) { // Updates the connection status badge in the popup based on whether the user is connected to GitHub
    if (isConnected) {
      badgeStatus.className = 'status-badge connected';
      badgeStatusText.textContent = 'Active';
    } else {
      badgeStatus.className = 'status-badge disconnected';
      badgeStatusText.textContent = 'Offline';
    }
  }

  function showError(element, message) { // Displays an error message in the specified element and makes it visible
    element.textContent = message;
    element.style.display = 'block';
  }

  function setLoading(button, isLoading, text) { // Toggles the loading state of a button, disabling it and changing its text to indicate an ongoing operation
    button.disabled = isLoading;
    button.querySelector('span').textContent = text;
  }

  function initializeSetupPane(token, username) { // Initializes the setup pane by fetching the user's repositories and populating the repository selection dropdown
    githubUsername.textContent = `@${username}`;
    userAvatar.textContent = username.slice(0, 2).toUpperCase();
    
    fetch(`https://api.github.com/users/${username}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.avatar_url) {
          userAvatar.innerHTML = `<img src="${data.avatar_url}" alt="${username}">`;
        }
      })
      .catch(() => {});

    chrome.runtime.sendMessage({ action: 'GET_REPOS', token }, (response) => { // Fetches the user's repositories from GitHub and populates the repository selection dropdown, handling errors if the fetch fails
      if (response && response.success) {
        cachedRepos = response.repos;
        populateReposList(cachedRepos);
      } else {
        selectRepo.innerHTML = '<option value="" disabled selected>Error loading repositories</option>';
        showError(setupError, response?.error || 'Could not fetch your repositories. Ensure PAT has repo permissions.');
      }
    });
  }

  selectRepo.addEventListener('change', () => {
    const selectedRepo = cachedRepos.find((repo) => repo.name === selectRepo.value);
    if (selectedRepo?.defaultBranch) {
      inputBranch.value = selectedRepo.defaultBranch;
    }
  });

  function populateReposList(repos) {
    if (repos.length === 0) {
      selectRepo.innerHTML = '<option value="" disabled selected>No repositories found. Create one!</option>';
      return;
    }

    selectRepo.innerHTML = '<option value="" disabled selected>Choose a repository...</option>';
    
    const sortedRepos = [...repos].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedRepos.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo.name;
      option.textContent = `${repo.name} ${repo.private ? '(Private)' : '(Public)'}`;
      selectRepo.appendChild(option);
    });
  }

  async function saveSetupAndTransition(username, repo, branch, owner = username) {
    await chrome.storage.local.set({
      githubRepo: repo,
      githubBranch: branch,
      githubOwner: owner
    });

    dashUsername.textContent = `@${username}`;
    dashRepo.textContent = `${owner}/${repo}`;
    dashRepo.href = `https://github.com/${owner}/${repo}`;
    dashBranch.textContent = branch;

    updateStatus(true);
    showPane(paneDashboard);
  }
});
