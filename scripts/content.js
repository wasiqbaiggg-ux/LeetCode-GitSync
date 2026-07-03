// This script is injected into the LeetCode problem pages to add a "Push to GitHub" button 
// and handle the logic for syncing solutions to a GitHub repository.
let monacoResolve = null;
let monacoReject = null;
let monacoTimeout = null;
let isPushInProgress = false;

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'CODE_AND_LANG_RESPONSE') {
    return;
  }

  clearTimeout(monacoTimeout);

  if (event.data.success) {
    if (monacoResolve) {
      monacoResolve({
        code: event.data.code,
        lang: event.data.lang
      });
    }
  } else if (monacoReject) {
    monacoReject(new Error(event.data.error || 'Failed to extract code.'));
  }

  monacoResolve = null;
  monacoReject = null;
});

function getCodeAndLangFromMonaco() {
  return new Promise((resolve, reject) => {
    monacoResolve = resolve;
    monacoReject = reject;

    window.postMessage({ action: 'GET_CODE_AND_LANG' }, '*');

    monacoTimeout = setTimeout(() => {
      if (monacoReject) {
        monacoReject(new Error('Monaco editor response timed out. Try refreshing the page.'));
        monacoResolve = null;
        monacoReject = null;
      }
    }, 8000);
  });
}

function getSavedSyncConfig() {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome?.storage?.local?.get) {
        reject(new Error('Chrome storage is unavailable in this context.'));
        return;
      }

      chrome.storage.local.get(
        ['githubToken', 'githubUsername', 'githubOwner', 'githubRepo', 'githubBranch'],
        (result) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Failed to read saved configuration.'));
            return;
          }

          resolve(result);
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome runtime messaging is unavailable in this context.'));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with the extension background script.'));
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getProblemSlug() {
  const match = window.location.href.match(/leetcode\.com\/problems\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function fetchProblemDetails(titleSlug) {
  const query = `
    query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        topicTags {
          name
        }
      }
    }
  `;

  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      query: query,
      variables: { titleSlug }
    })
  });

  if (!response.ok) {
    throw new Error(`LeetCode API returned status ${response.status}`);
  }

  const data = await response.json();
  if (data?.errors?.length) {
    throw new Error(data.errors[0]?.message || 'LeetCode GraphQL request failed.');
  }

  if (!data?.data?.question) {
    throw new Error('Problem details not found in LeetCode GraphQL response');
  }

  return data.data.question;
}

function convertHtmlToMarkdown(html) {
  if (!html) return '';
  let markdown = html;

  markdown = markdown.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '## $1\n\n');
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  markdown = markdown.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n');
  markdown = markdown.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)');
  markdown = markdown.replace(/<img[^>]+alt=["']([^"']*)["'][^>]+src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)');
  markdown = markdown.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  markdown = markdown.replace(/<[^>]+>/g, '');

  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&middot;': '·',
    '&deg;': '°'
  };
  for (const [entity, replacement] of Object.entries(entities)) {
    markdown = markdown.replace(new RegExp(entity, 'g'), replacement);
  }

  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  return markdown.trim();
}

function getFileExtension(lang) { // Maps programming languages to their respective file extensions
  const mapping = {
    'cpp': 'cpp',
    'c': 'c',
    'java': 'java',
    'python': 'py',
    'python3': 'py',
    'csharp': 'cs',
    'javascript': 'js',
    'typescript': 'ts',
    'rust': 'rs',
    'golang': 'go',
    'go': 'go',
    'kotlin': 'kt',
    'swift': 'swift',
    'ruby': 'rb',
    'scala': 'scala',
    'php': 'php',
    'html': 'html',
    'sql': 'sql'
  };
  return mapping[lang?.toLowerCase()] || 'txt';
}

function showNotConfiguredModal() { // Displays a modal prompting the user to configure GitHub settings
  if (document.getElementById('gitsync-not-configured-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'gitsync-not-configured-modal';
  overlay.className = 'gitsync-modal-overlay';

  overlay.innerHTML = `
    <div class="gitsync-modal-card">
      <div class="gitsync-modal-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div class="gitsync-modal-title">GitHub Not Configured</div>
      <div class="gitsync-modal-desc">
        You need to configure your GitHub repository and Personal Access Token before pushing. Click the LeetCode GitSync icon in your browser toolbar to set it up!
      </div>
      <button class="gitsync-modal-btn" id="gitsync-modal-close">Got It</button>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('active'), 10);

  overlay.querySelector('#gitsync-modal-close').addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  });
}

function findSubmitButton() { // Attempts to locate the "Submit" button on the LeetCode problem page
  const codeArea = document.querySelector('[data-cy="code-area"]');
  if (codeArea) {
    const scopedBtn = codeArea.querySelector('button[data-cy="submit-code-btn"]');
    if (scopedBtn) return scopedBtn;
  }

  let btn = document.querySelector('button[data-cy="submit-code-btn"]');
  if (btn) return btn;

  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    const txt = b.textContent?.trim().toLowerCase();
    if (txt === 'submit') {
      return b;
    }
  }

  return document.querySelector('button[class*="submit"]');
}

async function buildPushPayload(config) { // Builds the payload for pushing the solution and README to GitHub
  if (!config.githubToken || !config.githubUsername || !config.githubRepo) {
    throw new Error('GitHub configuration is incomplete. Please check your settings.');
  }
  const editorData = await getCodeAndLangFromMonaco();
  const { code, lang } = editorData;

  if (!code?.trim()) {
    throw new Error('Code editor is empty.');
  }

  const titleSlug = getProblemSlug();
  if (!titleSlug) {
    throw new Error('Could not parse problem title from URL.');
  }

  const question = await fetchProblemDetails(titleSlug);
  const difficulty = question.difficulty;
  const frontendId = String(question.questionFrontendId);
  const title = question.title;
  const ext = getFileExtension(lang);
  const problemMarkdown = convertHtmlToMarkdown(question.content);
  const readmeContent = `# ${frontendId}. ${title}\n\n## Difficulty\n**${difficulty}**\n\n## Problem Link\n[LeetCode - ${title}](https://leetcode.com/problems/${titleSlug}/)\n\n## Description\n${problemMarkdown}\n`;
  const paddedId = frontendId.padStart(4, '0');
  const folderName = `${paddedId}-${titleSlug}`;
  const codePath = `${folderName}/Solution.${ext}`;
  const readmePath = `${folderName}/README.md`;
  const owner = config.githubOwner || config.githubUsername;

  return {
    token: config.githubToken,
    owner,
    username: config.githubUsername,
    repo: config.githubRepo,
    branch: config.githubBranch || 'main',
    codePath,
    codeContent: code,
    codeMessage: `Sync Solution: ${title} (${difficulty}) - LeetCode #${frontendId}`,
    readmePath,
    readmeContent,
    readmeMessage: `Sync README: ${title} (${difficulty}) - LeetCode #${frontendId}`,
    title
  };
}

async function pushSolutionToGitHub(options = {}) {
  const { updateButton = null, silent = false } = options;

  if (isPushInProgress) {
    return { success: false, error: 'A push is already in progress.' };
  }

  const config = await getSavedSyncConfig();
  const owner = config.githubOwner || config.githubUsername;

  if (!config.githubToken || !owner || !config.githubRepo) {
    if (!silent) {
      showNotConfiguredModal();
    }
    return { success: false, error: 'GitHub is not configured.' };
  }

  isPushInProgress = true;

  if (updateButton) {
    updateButton.disabled = true;
    updateButton.innerHTML = `
      <span class="gitsync-spinner"></span>
      <span>Pushing...</span>
    `;
  }

  try {
    const payload = await buildPushPayload(config);
    const response = await sendMessageToBackground({ action: 'PUSH_TO_GITHUB', data: payload });

    if (response?.success) {
      if (updateButton) {
        updateButton.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Synced!</span>
        `;
        updateButton.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        setTimeout(() => restoreButton(updateButton), 3000);
      }

      return { success: true, title: payload.title };
    }

    const errorMessage = response?.error || 'Push failed.';
    if (updateButton) {
      showErrorState(updateButton, errorMessage);
    }
    return { success: false, error: errorMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push failed.';
    const displayMessage = message.includes('Extension context invalidated')
      ? 'The extension context was reloaded. Refresh the page and try again.'
      : message;

    if (updateButton) {
      showErrorState(updateButton, displayMessage);
    }

    console.error('GitSync exception:', err);
    return { success: false, error: displayMessage };
  } finally {
    isPushInProgress = false;
  }
}

function injectPushBtn() {
  const submitBtn = findSubmitButton();

  if (submitBtn && !document.getElementById('leetcode-gitsync-btn')) {
    const parentContainer = submitBtn.parentNode;
    if (!parentContainer) return;

    const pushBtn = document.createElement('button');
    pushBtn.id = 'leetcode-gitsync-btn';
    pushBtn.type = 'button';
    pushBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
      <span>Push to GitHub</span>
    `;

    pushBtn.addEventListener('click', () => {
      pushSolutionToGitHub({ updateButton: pushBtn });
    });

    parentContainer.insertBefore(pushBtn, submitBtn);

    if (!submitBtn.dataset.gitsyncHooked) {
      submitBtn.dataset.gitsyncHooked = 'true';
      submitBtn.addEventListener('click', () => {
        pushSolutionToGitHub({ silent: true });
      });
    }
  }
}

function restoreButton(btn) {
  btn.disabled = false;
  btn.style.background = '';
  btn.title = '';
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
    <span>Push to GitHub</span>
  `;
}

function showErrorState(btn, errorMsg) {
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
    <span>Failed</span>
  `;
  btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
  btn.title = errorMsg;

  setTimeout(() => {
    restoreButton(btn);
  }, 4000);
}

setInterval(injectPushBtn, 1000);
injectPushBtn();
