# LeetCode GitSync

A Chrome Extension that automatically syncs your LeetCode solutions to your GitHub repository with one click.

## What It Does

- **Authenticate** with GitHub using a Personal Access Token (PAT)
- **Configure** which GitHub repository to sync solutions to
- **Push** LeetCode solutions directly to GitHub with automatically generated README files
- All in a clean, dark-themed popup dashboard

## How It Works

1. You click the extension icon and paste your GitHub token
2. You select or create a GitHub repository
3. When solving a LeetCode problem, a purple "Push to GitHub" button appears
4. Click it to sync your solution and problem details to GitHub
5. Your code and a formatted README file are committed automatically

## File Structure

### Core Files

- **`manifest.json`** — Chrome extension configuration. Defines permissions, content scripts, and the popup UI.

- **`background.js`** — Background service worker that handles all GitHub API calls. It validates tokens, fetches repositories, creates repos, and pushes code to GitHub.

- **`popup.html` / `popup.css` / `popup.js`** — The extension's popup interface. This is where you authenticate, configure your repo, and see the dashboard once connected.

### LeetCode Integration

- **`content.js`** — Main content script that runs on LeetCode problem pages. It extracts your code from the Monaco editor, fetches problem details from LeetCode's GraphQL API, and sends everything to the background worker to push to GitHub.

- **`inject.js`** — Injected into the page's main world to access Monaco editor directly. Extracts the exact code and programming language you're using.

- **`content.css`** — Styles for the "Push to GitHub" button and success/error modals shown on LeetCode.

## Project Workflow

```
User Interaction Flow:
┌─────────────────────────────────────────────────────────────┐
│ 1. Click extension icon → Popup opens                        │
├─────────────────────────────────────────────────────────────┤
│ 2. Enter GitHub PAT → background.js validates with API      │
├─────────────────────────────────────────────────────────────┤
│ 3. Select or create repo → Config saved in Chrome storage   │
├─────────────────────────────────────────────────────────────┤
│ 4. Go to LeetCode problem page                              │
├─────────────────────────────────────────────────────────────┤
│ 5. Click "Push to GitHub" button (injected by content.js)   │
├─────────────────────────────────────────────────────────────┤
│ 6. content.js extracts code via inject.js                   │
├─────────────────────────────────────────────────────────────┤
│ 7. content.js fetches problem details from LeetCode API     │
├─────────────────────────────────────────────────────────────┤
│ 8. Sends everything to background.js                        │
├─────────────────────────────────────────────────────────────┤
│ 9. background.js pushes code + README to GitHub             │
├─────────────────────────────────────────────────────────────┤
│ 10. Button shows "Synced!" with checkmark                   │
└─────────────────────────────────────────────────────────────┘
```

## Installation

1. Download or clone this directory
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Pin the extension to your toolbar

## Quick Start

1. Click the LeetCode GitSync icon
2. Generate a [GitHub Personal Access Token](https://github.com/settings/tokens/new?scopes=repo&description=LeetCode%20GitSync) with **repo** scope
3. Paste it in the popup and verify
4. Choose an existing repository or create a new one
5. Go solve a LeetCode problem and click "Push to GitHub"

## Requirements

- Chrome browser (or any Chromium-based browser)
- GitHub account with a Personal Access Token (repo scope)
- LeetCode problem access

## Notes

- Your PAT is stored locally in Chrome storage and never sent anywhere except to GitHub's official API
- Solutions are organized in your repo with problem IDs and titles
- Each solution gets an automatically generated README with problem description and difficulty