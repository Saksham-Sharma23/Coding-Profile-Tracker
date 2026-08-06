import { detectWithRetry, fromProfileLink } from './detect';

// LeetCode's avatar menu links to /u/<username>/ once the nav hydrates.
detectWithRetry('leetcode', () => fromProfileLink(/^(?:https:\/\/leetcode\.com)?\/u\/([^/?#]+)\/?$/));
