// background.js
// Communication bridge between the extension UI/content scripts and the GitHub API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle different actions based on the request
  switch (request.action) {
    case 'VALIDATE_TOKEN':
      validateToken(request.token)
        .then(username => sendResponse({ success: true, username }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_REPOS':
      getRepositories(request.token)
        .then(repos => sendResponse({ success: true, repos }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CREATE_REPO':
      createRepository(request.token, request.repoName)
        .then(repo => sendResponse({ success: true, repo }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'PUSH_TO_GITHUB':
      pushToGitHub(request.data)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    default:
      console.warn(`Unknown action received: ${request.action}`);
      return false;
  }
});

function getAuthHeaders(token) {
  return { 
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };
}

// Encodes each segment of a path to ensure special characters are handled correctly in GitHub API requests
function encodePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/'); 
}

async function validateToken(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: getAuthHeaders(token)
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub token. Please check your permissions.');
    }
    throw new Error(`GitHub Auth Failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.login; // returns username
}

async function getRepositories(token) {
  let repos = [];
  let page = 1;
  let hasMore = true;

  // Limit to 3 pages of results to avoid excessive API calls
  while (hasMore && page <= 3) {
    const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`;
    const response = await fetch(url, { headers: getAuthHeaders(token) });

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.length === 0) {
      hasMore = false;
    } else {
      // Format the repository data to only include necessary fields
      const formattedRepos = data.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner?.login || repo.full_name.split('/')[0],
        private: repo.private,
        description: repo.description,
        defaultBranch: repo.default_branch || 'main'
      }));
      
      repos = repos.concat(formattedRepos);
      page++;
    }
  }

  return repos;
}

async function createRepository(token, repoName) {
  const response = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      ...getAuthHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: repoName,
      description: 'LeetCode solutions automatically synced using LeetCode GitSync extension',
      private: true,
      auto_init: true // Creates an initial commit with a README so the branch exists immediately
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create repository: ${errData.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    name: data.name,
    fullName: data.full_name,
    owner: data.owner?.login,
    defaultBranch: data.default_branch || 'main'
  };
}

// Ensures the target branch actually exists, otherwise falls back to the repo's default branch
async function resolveBranch(token, owner, repo, branch) {
  const target = branch || 'main';

  const branchCheck = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(target)}`,
    { headers: getAuthHeaders(token) }
  );

  if (branchCheck.ok) return target;

  // Fallback routine if specified branch isn't found
  const repoCheck = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: getAuthHeaders(token)
  });

  if (!repoCheck.ok) {
    const errData = await repoCheck.json().catch(() => ({}));
    throw new Error(errData.message || `Repository ${owner}/${repo} is missing or inaccessible.`);
  }

  const repoData = await repoCheck.json();
  return repoData.default_branch || 'main';
}

// Helper to check if a file exists and get its SHA hash (required by GitHub for updates)
async function getFileSha(token, owner, repo, path, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: getAuthHeaders(token) });

  if (response.status === 200) { 
    const data = await response.json();
    return data.sha;
  }
  
  if (response.status === 404) {
    return null; // File doesn't exist yet
  }

  throw new Error(`Error checking file status: ${response.statusText}`);
}

async function createOrUpdateFile(token, owner, repo, path, content, commitMessage, branch, sha = null) { 
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;

  // Safe Base64 encoding workaround for UTF-8/Unicode strings in a service worker environment
  const bytes = new TextEncoder().encode(content);
  let binString = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  const base64Content = btoa(binString);
  
  const body = {
    message: commitMessage,
    content: base64Content,
    branch: branch
  };

  if (sha) body.sha = sha; // GitHub API requires the current SHA if we are updating an existing file

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Failed to write file ${path}: ${errData.message || response.statusText}`);
  }

  return await response.json();
}

async function pushToGitHub(data) { 
  const { 
    token, owner, username, repo, branch, 
    codePath, codeContent, codeMessage, 
    readmePath, readmeContent, readmeMessage 
  } = data;

  const repoOwner = owner || username;
  if (!token || !repoOwner || !repo || !codePath || !codeContent) {
    throw new Error('Missing required sync parameters.');
  }

  const targetBranch = await resolveBranch(token, repoOwner, repo, branch || 'main');

  // 1. Sync the source code file
  console.log(`Syncing code file to: ${codePath}`);
  const codeSha = await getFileSha(token, repoOwner, repo, codePath, targetBranch);
  await createOrUpdateFile(token, repoOwner, repo, codePath, codeContent, codeMessage, targetBranch, codeSha);

  // 2. Sync the README file if provided
  if (readmePath && readmeContent) {
    console.log(`Syncing README file to: ${readmePath}`);
    const readmeSha = await getFileSha(token, repoOwner, repo, readmePath, targetBranch);
    await createOrUpdateFile(token, repoOwner, repo, readmePath, readmeContent, readmeMessage, targetBranch, readmeSha);
  }

  return { success: true, branch: targetBranch };
}