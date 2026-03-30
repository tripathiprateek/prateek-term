/**
 * Prateek-Term — macOS Terminal Emulator & SSH Connection Manager
 *
 * Copyright (c) 2026 Prateek Tripathi
 * Contact  : tripathiprateek@gmail.com
 * License  : Polyform Noncommercial License 1.0.0
 *            Personal/non-commercial use only.
 *            Attribution required in About screen for any derivative work.
 *            Commercial use requires prior written permission from the author.
 *
 * See LICENSE file in the project root for full license terms.
 */

/* global Terminal, FitAddon, WebLinksAddon, SearchAddon */

// ===== Themes =====

const THEMES = {
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    dark: true,
    ui: {
      '--bg-primary':    '#1e1e2e', '--bg-secondary':  '#181825',
      '--bg-tertiary':   '#11111b', '--bg-surface':    '#313244',
      '--bg-hover':      '#45475a', '--text-primary':  '#cdd6f4',
      '--text-secondary':'#a6adc8', '--text-muted':    '#6c7086',
      '--accent-blue':   '#89b4fa', '--accent-green':  '#a6e3a1',
      '--accent-red':    '#f38ba8', '--accent-yellow': '#f9e2af',
      '--accent-mauve':  '#cba6f7', '--accent-teal':   '#94e2d5',
      '--accent-peach':  '#fab387', '--border-color':  '#313244',
      '--border-subtle': '#25253a',
    },
    terminal: {
      background:'#1e1e2e', foreground:'#cdd6f4', cursor:'#f5e0dc',
      selectionBackground:'#45475a88', selectionForeground:'#cdd6f4',
      black:'#45475a',   red:'#f38ba8', green:'#a6e3a1', yellow:'#f9e2af',
      blue:'#89b4fa',    magenta:'#cba6f7', cyan:'#94e2d5', white:'#bac2de',
      brightBlack:'#585b70', brightRed:'#f38ba8', brightGreen:'#a6e3a1',
      brightYellow:'#f9e2af', brightBlue:'#89b4fa', brightMagenta:'#cba6f7',
      brightCyan:'#94e2d5',  brightWhite:'#a6adc8',
    },
    swatch: ['#1e1e2e','#cdd6f4','#f38ba8','#89b4fa'],
  },
  'dracula': {
    label: 'Dracula',
    dark: true,
    ui: {
      '--bg-primary':    '#282a36', '--bg-secondary':  '#21222c',
      '--bg-tertiary':   '#191a21', '--bg-surface':    '#44475a',
      '--bg-hover':      '#6272a4', '--text-primary':  '#f8f8f2',
      '--text-secondary':'#bfbfbf', '--text-muted':    '#6272a4',
      '--accent-blue':   '#6272a4', '--accent-green':  '#50fa7b',
      '--accent-red':    '#ff5555', '--accent-yellow': '#f1fa8c',
      '--accent-mauve':  '#bd93f9', '--accent-teal':   '#8be9fd',
      '--accent-peach':  '#ffb86c', '--border-color':  '#44475a',
      '--border-subtle': '#383a4a',
    },
    terminal: {
      background:'#282a36', foreground:'#f8f8f2', cursor:'#f8f8f2',
      selectionBackground:'#44475a88', selectionForeground:'#f8f8f2',
      black:'#21222c',   red:'#ff5555', green:'#50fa7b', yellow:'#f1fa8c',
      blue:'#bd93f9',    magenta:'#ff79c6', cyan:'#8be9fd', white:'#f8f8f2',
      brightBlack:'#6272a4', brightRed:'#ff6e6e', brightGreen:'#69ff94',
      brightYellow:'#ffffa5', brightBlue:'#d6acff', brightMagenta:'#ff92df',
      brightCyan:'#a4ffff',  brightWhite:'#ffffff',
    },
    swatch: ['#282a36','#f8f8f2','#ff5555','#bd93f9'],
  },
  'nord': {
    label: 'Nord',
    dark: true,
    ui: {
      '--bg-primary':    '#2e3440', '--bg-secondary':  '#272c36',
      '--bg-tertiary':   '#1f242d', '--bg-surface':    '#3b4252',
      '--bg-hover':      '#434c5e', '--text-primary':  '#eceff4',
      '--text-secondary':'#d8dee9', '--text-muted':    '#4c566a',
      '--accent-blue':   '#81a1c1', '--accent-green':  '#a3be8c',
      '--accent-red':    '#bf616a', '--accent-yellow': '#ebcb8b',
      '--accent-mauve':  '#b48ead', '--accent-teal':   '#88c0d0',
      '--accent-peach':  '#d08770', '--border-color':  '#3b4252',
      '--border-subtle': '#323844',
    },
    terminal: {
      background:'#2e3440', foreground:'#eceff4', cursor:'#88c0d0',
      selectionBackground:'#434c5e88', selectionForeground:'#eceff4',
      black:'#3b4252',   red:'#bf616a', green:'#a3be8c', yellow:'#ebcb8b',
      blue:'#81a1c1',    magenta:'#b48ead', cyan:'#88c0d0', white:'#e5e9f0',
      brightBlack:'#4c566a', brightRed:'#bf616a', brightGreen:'#a3be8c',
      brightYellow:'#ebcb8b', brightBlue:'#81a1c1', brightMagenta:'#b48ead',
      brightCyan:'#8fbcbb',  brightWhite:'#eceff4',
    },
    swatch: ['#2e3440','#eceff4','#bf616a','#88c0d0'],
  },
  'one-dark': {
    label: 'One Dark',
    dark: true,
    ui: {
      '--bg-primary':    '#282c34', '--bg-secondary':  '#21252b',
      '--bg-tertiary':   '#1a1e24', '--bg-surface':    '#2c313c',
      '--bg-hover':      '#3e4451', '--text-primary':  '#abb2bf',
      '--text-secondary':'#9da5b4', '--text-muted':    '#5c6370',
      '--accent-blue':   '#61afef', '--accent-green':  '#98c379',
      '--accent-red':    '#e06c75', '--accent-yellow': '#e5c07b',
      '--accent-mauve':  '#c678dd', '--accent-teal':   '#56b6c2',
      '--accent-peach':  '#d19a66', '--border-color':  '#3e4451',
      '--border-subtle': '#30343d',
    },
    terminal: {
      background:'#282c34', foreground:'#abb2bf', cursor:'#528bff',
      selectionBackground:'#3e445188', selectionForeground:'#abb2bf',
      black:'#3f4451',   red:'#e06c75', green:'#98c379', yellow:'#e5c07b',
      blue:'#61afef',    magenta:'#c678dd', cyan:'#56b6c2', white:'#d7dae0',
      brightBlack:'#4f5666', brightRed:'#e06c75', brightGreen:'#98c379',
      brightYellow:'#e5c07b', brightBlue:'#61afef', brightMagenta:'#c678dd',
      brightCyan:'#56b6c2',  brightWhite:'#ffffff',
    },
    swatch: ['#282c34','#abb2bf','#e06c75','#61afef'],
  },
  'gruvbox-dark': {
    label: 'Gruvbox Dark',
    dark: true,
    ui: {
      '--bg-primary':    '#282828', '--bg-secondary':  '#1d2021',
      '--bg-tertiary':   '#141617', '--bg-surface':    '#3c3836',
      '--bg-hover':      '#504945', '--text-primary':  '#ebdbb2',
      '--text-secondary':'#d5c4a1', '--text-muted':    '#928374',
      '--accent-blue':   '#83a598', '--accent-green':  '#b8bb26',
      '--accent-red':    '#fb4934', '--accent-yellow': '#fabd2f',
      '--accent-mauve':  '#d3869b', '--accent-teal':   '#8ec07c',
      '--accent-peach':  '#fe8019', '--border-color':  '#3c3836',
      '--border-subtle': '#32302f',
    },
    terminal: {
      background:'#282828', foreground:'#ebdbb2', cursor:'#ebdbb2',
      selectionBackground:'#50494588', selectionForeground:'#ebdbb2',
      black:'#282828',   red:'#cc241d', green:'#98971a', yellow:'#d79921',
      blue:'#458588',    magenta:'#b16286', cyan:'#689d6a', white:'#a89984',
      brightBlack:'#928374', brightRed:'#fb4934', brightGreen:'#b8bb26',
      brightYellow:'#fabd2f', brightBlue:'#83a598', brightMagenta:'#d3869b',
      brightCyan:'#8ec07c',  brightWhite:'#ebdbb2',
    },
    swatch: ['#282828','#ebdbb2','#fb4934','#83a598'],
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    dark: true,
    ui: {
      '--bg-primary':    '#1a1b26', '--bg-secondary':  '#16161e',
      '--bg-tertiary':   '#13131a', '--bg-surface':    '#24283b',
      '--bg-hover':      '#292e42', '--text-primary':  '#c0caf5',
      '--text-secondary':'#a9b1d6', '--text-muted':    '#565f89',
      '--accent-blue':   '#7aa2f7', '--accent-green':  '#9ece6a',
      '--accent-red':    '#f7768e', '--accent-yellow': '#e0af68',
      '--accent-mauve':  '#bb9af7', '--accent-teal':   '#7dcfff',
      '--accent-peach':  '#ff9e64', '--border-color':  '#24283b',
      '--border-subtle': '#1e2030',
    },
    terminal: {
      background:'#1a1b26', foreground:'#c0caf5', cursor:'#c0caf5',
      selectionBackground:'#29304288', selectionForeground:'#c0caf5',
      black:'#15161e',   red:'#f7768e', green:'#9ece6a', yellow:'#e0af68',
      blue:'#7aa2f7',    magenta:'#bb9af7', cyan:'#7dcfff', white:'#a9b1d6',
      brightBlack:'#414868', brightRed:'#f7768e', brightGreen:'#9ece6a',
      brightYellow:'#e0af68', brightBlue:'#7aa2f7', brightMagenta:'#bb9af7',
      brightCyan:'#7dcfff',  brightWhite:'#c0caf5',
    },
    swatch: ['#1a1b26','#c0caf5','#f7768e','#7aa2f7'],
  },
  'solarized-dark': {
    label: 'Solarized Dark',
    dark: true,
    ui: {
      '--bg-primary':    '#002b36', '--bg-secondary':  '#00212b',
      '--bg-tertiary':   '#00181f', '--bg-surface':    '#073642',
      '--bg-hover':      '#0a4555', '--text-primary':  '#839496',
      '--text-secondary':'#657b83', '--text-muted':    '#586e75',
      '--accent-blue':   '#268bd2', '--accent-green':  '#859900',
      '--accent-red':    '#dc322f', '--accent-yellow': '#b58900',
      '--accent-mauve':  '#6c71c4', '--accent-teal':   '#2aa198',
      '--accent-peach':  '#cb4b16', '--border-color':  '#073642',
      '--border-subtle': '#003847',
    },
    terminal: {
      background:'#002b36', foreground:'#839496', cursor:'#839496',
      selectionBackground:'#0a455588', selectionForeground:'#839496',
      black:'#073642',   red:'#dc322f', green:'#859900', yellow:'#b58900',
      blue:'#268bd2',    magenta:'#d33682', cyan:'#2aa198', white:'#eee8d5',
      brightBlack:'#002b36', brightRed:'#cb4b16', brightGreen:'#586e75',
      brightYellow:'#657b83', brightBlue:'#839496', brightMagenta:'#6c71c4',
      brightCyan:'#93a1a1',  brightWhite:'#fdf6e3',
    },
    swatch: ['#002b36','#839496','#dc322f','#268bd2'],
  },
  'light': {
    label: 'GitHub Light',
    dark: false,
    ui: {
      '--bg-primary':    '#ffffff', '--bg-secondary':  '#f6f8fa',
      '--bg-tertiary':   '#eaeef2', '--bg-surface':    '#f6f8fa',
      '--bg-hover':      '#eaeef2', '--text-primary':  '#24292f',
      '--text-secondary':'#57606a', '--text-muted':    '#8c959f',
      '--accent-blue':   '#0969da', '--accent-green':  '#1a7f37',
      '--accent-red':    '#cf222e', '--accent-yellow': '#9a6700',
      '--accent-mauve':  '#8250df', '--accent-teal':   '#0969da',
      '--accent-peach':  '#bc4c00', '--border-color':  '#d0d7de',
      '--border-subtle': '#e5e8eb',
    },
    terminal: {
      background:'#ffffff', foreground:'#24292f', cursor:'#24292f',
      selectionBackground:'#0969da33', selectionForeground:'#24292f',
      black:'#24292f',   red:'#cf222e', green:'#1a7f37', yellow:'#9a6700',
      blue:'#0969da',    magenta:'#8250df', cyan:'#0969da', white:'#6e7781',
      brightBlack:'#57606a', brightRed:'#a40e26', brightGreen:'#116329',
      brightYellow:'#7d4e00', brightBlue:'#0550ae', brightMagenta:'#622cbc',
      brightCyan:'#1b7c83',  brightWhite:'#8c959f',
    },
    swatch: ['#ffffff','#24292f','#cf222e','#0969da'],
  },

  'catppuccin-latte': {
    label: 'Catppuccin Latte',
    dark: false,
    ui: {
      '--bg-primary':    '#eff1f5', '--bg-secondary':  '#e6e9ef',
      '--bg-tertiary':   '#dce0e8', '--bg-surface':    '#ccd0da',
      '--bg-hover':      '#bcc0cc', '--text-primary':  '#4c4f69',
      '--text-secondary':'#5c5f77', '--text-muted':    '#9ca0b0',
      '--accent-blue':   '#1e66f5', '--accent-green':  '#40a02b',
      '--accent-red':    '#d20f39', '--accent-yellow': '#df8e1d',
      '--accent-mauve':  '#8839ef', '--accent-teal':   '#179299',
      '--accent-peach':  '#fe640b', '--border-color':  '#ccd0da',
      '--border-subtle': '#d5d9e0',
    },
    terminal: {
      background:'#eff1f5', foreground:'#4c4f69', cursor:'#dc8a78',
      selectionBackground:'#1e66f533', selectionForeground:'#4c4f69',
      black:'#5c5f77',   red:'#d20f39', green:'#40a02b', yellow:'#df8e1d',
      blue:'#1e66f5',    magenta:'#ea76cb', cyan:'#179299', white:'#acb0be',
      brightBlack:'#6c6f85', brightRed:'#d20f39', brightGreen:'#40a02b',
      brightYellow:'#df8e1d', brightBlue:'#1e66f5', brightMagenta:'#8839ef',
      brightCyan:'#179299',  brightWhite:'#bcc0cc',
    },
    swatch: ['#eff1f5','#4c4f69','#d20f39','#1e66f5'],
  },

  'solarized-light': {
    label: 'Solarized Light',
    dark: false,
    ui: {
      '--bg-primary':    '#fdf6e3', '--bg-secondary':  '#eee8d5',
      '--bg-tertiary':   '#e8e0c8', '--bg-surface':    '#eee8d5',
      '--bg-hover':      '#ddd6c2', '--text-primary':  '#657b83',
      '--text-secondary':'#586e75', '--text-muted':    '#93a1a1',
      '--accent-blue':   '#268bd2', '--accent-green':  '#859900',
      '--accent-red':    '#dc322f', '--accent-yellow': '#b58900',
      '--accent-mauve':  '#6c71c4', '--accent-teal':   '#2aa198',
      '--accent-peach':  '#cb4b16', '--border-color':  '#d3cbb5',
      '--border-subtle': '#e0d9c7',
    },
    terminal: {
      background:'#fdf6e3', foreground:'#657b83', cursor:'#657b83',
      selectionBackground:'#268bd233', selectionForeground:'#657b83',
      black:'#073642',   red:'#dc322f', green:'#859900', yellow:'#b58900',
      blue:'#268bd2',    magenta:'#d33682', cyan:'#2aa198', white:'#eee8d5',
      brightBlack:'#002b36', brightRed:'#cb4b16', brightGreen:'#586e75',
      brightYellow:'#657b83', brightBlue:'#839496', brightMagenta:'#6c71c4',
      brightCyan:'#93a1a1',  brightWhite:'#fdf6e3',
    },
    swatch: ['#fdf6e3','#657b83','#dc322f','#268bd2'],
  },

  'one-light': {
    label: 'One Light',
    dark: false,
    ui: {
      '--bg-primary':    '#fafafa', '--bg-secondary':  '#f0f0f0',
      '--bg-tertiary':   '#e5e5e5', '--bg-surface':    '#e8e8e8',
      '--bg-hover':      '#d8d8d8', '--text-primary':  '#383a42',
      '--text-secondary':'#696c77', '--text-muted':    '#a0a1a7',
      '--accent-blue':   '#4078f2', '--accent-green':  '#50a14f',
      '--accent-red':    '#e45649', '--accent-yellow': '#c18401',
      '--accent-mauve':  '#a626a4', '--accent-teal':   '#0184bc',
      '--accent-peach':  '#d75f00', '--border-color':  '#d3d3d3',
      '--border-subtle': '#e0e0e0',
    },
    terminal: {
      background:'#fafafa', foreground:'#383a42', cursor:'#383a42',
      selectionBackground:'#4078f233', selectionForeground:'#383a42',
      black:'#383a42',   red:'#e45649', green:'#50a14f', yellow:'#c18401',
      blue:'#4078f2',    magenta:'#a626a4', cyan:'#0184bc', white:'#fafafa',
      brightBlack:'#4f525e', brightRed:'#e45649', brightGreen:'#50a14f',
      brightYellow:'#c18401', brightBlue:'#4078f2', brightMagenta:'#a626a4',
      brightCyan:'#0184bc',  brightWhite:'#ffffff',
    },
    swatch: ['#fafafa','#383a42','#e45649','#4078f2'],
  },

  'rose-pine-dawn': {
    label: 'Rosé Pine Dawn',
    dark: false,
    ui: {
      '--bg-primary':    '#faf4ed', '--bg-secondary':  '#fffaf3',
      '--bg-tertiary':   '#f2e9e1', '--bg-surface':    '#f2e9e1',
      '--bg-hover':      '#dfdad9', '--text-primary':  '#575279',
      '--text-secondary':'#797593', '--text-muted':    '#9893a5',
      '--accent-blue':   '#286983', '--accent-green':  '#56949f',
      '--accent-red':    '#b4637a', '--accent-yellow': '#ea9d34',
      '--accent-mauve':  '#907aa9', '--accent-teal':   '#56949f',
      '--accent-peach':  '#d7827e', '--border-color':  '#dfdad9',
      '--border-subtle': '#e8e3e1',
    },
    terminal: {
      background:'#faf4ed', foreground:'#575279', cursor:'#cecacd',
      selectionBackground:'#28698333', selectionForeground:'#575279',
      black:'#f2e9e1',   red:'#b4637a', green:'#56949f', yellow:'#ea9d34',
      blue:'#286983',    magenta:'#907aa9', cyan:'#56949f', white:'#575279',
      brightBlack:'#9893a5', brightRed:'#b4637a', brightGreen:'#56949f',
      brightYellow:'#ea9d34', brightBlue:'#286983', brightMagenta:'#907aa9',
      brightCyan:'#56949f',  brightWhite:'#575279',
    },
    swatch: ['#faf4ed','#575279','#b4637a','#286983'],
  },

  'tokyo-day': {
    label: 'Tokyo Day',
    dark: false,
    ui: {
      '--bg-primary':    '#e1e2e7', '--bg-secondary':  '#d5d6db',
      '--bg-tertiary':   '#c8c9ce', '--bg-surface':    '#cbccd1',
      '--bg-hover':      '#c0c1c6', '--text-primary':  '#3760bf',
      '--text-secondary':'#6172b0', '--text-muted':    '#848cb5',
      '--accent-blue':   '#2e7de9', '--accent-green':  '#587539',
      '--accent-red':    '#f52a65', '--accent-yellow': '#8c6c3e',
      '--accent-mauve':  '#9854f1', '--accent-teal':   '#007197',
      '--accent-peach':  '#b15c00', '--border-color':  '#c0c1c6',
      '--border-subtle': '#d0d1d6',
    },
    terminal: {
      background:'#e1e2e7', foreground:'#3760bf', cursor:'#3760bf',
      selectionBackground:'#2e7de933', selectionForeground:'#3760bf',
      black:'#3760bf',   red:'#f52a65', green:'#587539', yellow:'#8c6c3e',
      blue:'#2e7de9',    magenta:'#9854f1', cyan:'#007197', white:'#6172b0',
      brightBlack:'#848cb5', brightRed:'#f52a65', brightGreen:'#587539',
      brightYellow:'#8c6c3e', brightBlue:'#2e7de9', brightMagenta:'#9854f1',
      brightCyan:'#007197',  brightWhite:'#3760bf',
    },
    swatch: ['#e1e2e7','#3760bf','#f52a65','#2e7de9'],
  },

  'gruvbox-light': {
    label: 'Gruvbox Light',
    dark: false,
    ui: {
      '--bg-primary':    '#fbf1c7', '--bg-secondary':  '#f2e5bc',
      '--bg-tertiary':   '#ebdbb2', '--bg-surface':    '#ebdbb2',
      '--bg-hover':      '#d5c4a1', '--text-primary':  '#3c3836',
      '--text-secondary':'#504945', '--text-muted':    '#928374',
      '--accent-blue':   '#076678', '--accent-green':  '#79740e',
      '--accent-red':    '#9d0006', '--accent-yellow': '#b57614',
      '--accent-mauve':  '#8f3f71', '--accent-teal':   '#427b58',
      '--accent-peach':  '#af3a03', '--border-color':  '#d5c4a1',
      '--border-subtle': '#e0d2b0',
    },
    terminal: {
      background:'#fbf1c7', foreground:'#3c3836', cursor:'#3c3836',
      selectionBackground:'#07667833', selectionForeground:'#3c3836',
      black:'#fbf1c7',   red:'#9d0006', green:'#79740e', yellow:'#b57614',
      blue:'#076678',    magenta:'#8f3f71', cyan:'#427b58', white:'#3c3836',
      brightBlack:'#928374', brightRed:'#cc241d', brightGreen:'#98971a',
      brightYellow:'#d79921', brightBlue:'#458588', brightMagenta:'#b16286',
      brightCyan:'#689d6a',  brightWhite:'#3c3836',
    },
    swatch: ['#fbf1c7','#3c3836','#9d0006','#076678'],
  },

  'material-lighter': {
    label: 'Material Lighter',
    dark: false,
    ui: {
      '--bg-primary':    '#fafafa', '--bg-secondary':  '#f5f5f5',
      '--bg-tertiary':   '#eeeeee', '--bg-surface':    '#e0e0e0',
      '--bg-hover':      '#d6d6d6', '--text-primary':  '#212121',
      '--text-secondary':'#616161', '--text-muted':    '#9e9e9e',
      '--accent-blue':   '#1565c0', '--accent-green':  '#2e7d32',
      '--accent-red':    '#c62828', '--accent-yellow': '#f57f17',
      '--accent-mauve':  '#6a1b9a', '--accent-teal':   '#00695c',
      '--accent-peach':  '#e65100', '--border-color':  '#e0e0e0',
      '--border-subtle': '#eeeeee',
    },
    terminal: {
      background:'#fafafa', foreground:'#212121', cursor:'#272727',
      selectionBackground:'#1565c033', selectionForeground:'#212121',
      black:'#212121',   red:'#c62828', green:'#2e7d32', yellow:'#f57f17',
      blue:'#1565c0',    magenta:'#6a1b9a', cyan:'#00695c', white:'#bdbdbd',
      brightBlack:'#616161', brightRed:'#e53935', brightGreen:'#43a047',
      brightYellow:'#f9a825', brightBlue:'#1e88e5', brightMagenta:'#8e24aa',
      brightCyan:'#00897b',  brightWhite:'#eeeeee',
    },
    swatch: ['#fafafa','#212121','#c62828','#1565c0'],
  },
};

function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES['catppuccin-mocha'];
  const root = document.documentElement;
  Object.entries(theme.ui).forEach(([k, v]) => root.style.setProperty(k, v));
  // Update all open terminal instances
  state.tabs.forEach((tab) => {
    if (tab.term) tab.term.options.theme = theme.terminal;
  });
  state.currentTheme = themeId;
}

// ===== State =====
const state = {
  tabs: [],
  activeTabId: null,
  profiles: [],
  editingProfileId: null,
  sshMode: 'terminal',
  scpDirection: 'upload',
  authType: 'key',
  keyMode: 'file', // file | paste
  sidebarCollapsed: false,
  currentTags: [], // tags for the connection being edited
  activeTagFilter: null, // tag filter on sidebar
  collapsedGroups: {}, // track collapsed protocol groups
  currentActions: [],    // Array<{id, name, script}> — actions for profile being edited
  editingActionId: null, // null = new action, string id = editing existing
};

let tabIdCounter = 0;

// Buffers for terminal events that arrive before the tab is registered in state.tabs.
// This handles the race where a process (e.g. SSH) fails immediately, sending data
// and an exit event before terminal:create IPC returns and the tab is pushed.
const pendingTerminalData = new Map(); // ptyId -> string[]
const pendingTerminalExit = new Map(); // ptyId -> { exitCode, signal }

// ===== DOM References =====
const dom = {
  tabsContainer: document.getElementById('tabs-container'),
  terminalContainer: document.getElementById('terminal-container'),
  btnNewTab: document.getElementById('btn-new-tab'),
  btnConnectionManager: document.getElementById('btn-connection-manager'),
  connectionModal: document.getElementById('connection-modal'),
  modalClose: document.getElementById('modal-close'),
  connectionForm: document.getElementById('connection-form'),
  profilesList: document.getElementById('profiles-list'),
  filterProtocol: document.getElementById('filter-protocol'),
  profilesSearchInput: document.getElementById('profiles-search-input'),
  btnNewProfile: document.getElementById('btn-new-profile'),
  btnSaveProfile: document.getElementById('btn-save-profile'),
  btnDeleteProfile: document.getElementById('btn-delete-profile'),
  connProtocol: document.getElementById('conn-protocol'),
  connName: document.getElementById('conn-name'),
  connHost: document.getElementById('conn-host'),
  connPort: document.getElementById('conn-port'),
  connUsername: document.getElementById('conn-username'),
  connPem: document.getElementById('conn-pem'),
  btnBrowsePem: document.getElementById('btn-browse-pem'),
  btnClearPem: document.getElementById('btn-clear-pem'),
  connPassword: document.getElementById('conn-password'),
  btnTogglePassword: document.getElementById('btn-toggle-password'),
  authKeySection: document.getElementById('auth-key-section'),
  authPasswordSection: document.getElementById('auth-password-section'),
  keyFileSection: document.getElementById('key-file-section'),
  keyPasteSection: document.getElementById('key-paste-section'),
  connPemText: document.getElementById('conn-pem-text'),
  connExtraOptions: document.getElementById('conn-extra-options'),
  connTelnetOptions: document.getElementById('conn-telnet-options'),
  connFTPOptions: document.getElementById('conn-ftp-options'),
  connSCPDirection: document.getElementById('conn-scp-direction'),
  connSCPLocal: document.getElementById('conn-scp-local'),
  connSCPRemote: document.getElementById('conn-scp-remote'),
  btnBrowseLocal: document.getElementById('btn-browse-local'),
  // Sections
  authSection: document.getElementById('auth-section'),
  sshModeSection: document.getElementById('ssh-mode-section'),
  sshCommonOptions: document.getElementById('ssh-common-options'),
  scpTransferSection: document.getElementById('scp-transfer-section'),
  telnetOptionsSection: document.getElementById('telnet-options-section'),
  ftpOptionsSection: document.getElementById('ftp-options-section'),
  serialOptionsSection: document.getElementById('serial-options-section'),
  serialPort: document.getElementById('serial-port'),
  serialBaud: document.getElementById('serial-baud'),
  serialDatabits: document.getElementById('serial-databits'),
  serialStopbits: document.getElementById('serial-stopbits'),
  serialParity: document.getElementById('serial-parity'),
  serialFlow: document.getElementById('serial-flow'),
  // Option checkboxes
  optCompression: document.getElementById('opt-compression'),
  optVerbose: document.getElementById('opt-verbose'),
  optAgentForwarding: document.getElementById('opt-agent-forwarding'),
  optX11Forwarding: document.getElementById('opt-x11-forwarding'),
  optStrictHostOff: document.getElementById('opt-strict-host-off'),
  optKeepAlive: document.getElementById('opt-keep-alive'),
  optIpv4: document.getElementById('opt-ipv4'),
  optIpv6: document.getElementById('opt-ipv6'),
  optScpRecursive: document.getElementById('opt-scp-recursive'),
  optScpLegacy: document.getElementById('opt-scp-legacy'),
  // Tags
  connTagsList: document.getElementById('conn-tags-list'),
  connTagInput: document.getElementById('conn-tag-input'),
  connTagColor: document.getElementById('conn-tag-color'),
  btnAddTag: document.getElementById('btn-add-tag'),
  tagSuggestions: document.getElementById('tag-suggestions'),
  // Sidebar
  hostsSidebar: document.getElementById('hosts-sidebar'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnSidebarAdd: document.getElementById('btn-sidebar-add'),
  sidebarSearchInput: document.getElementById('sidebar-search-input'),
  sidebarTagFilters: document.getElementById('sidebar-tag-filters'),
  sidebarHostsList: document.getElementById('sidebar-hosts-list'),
  // Actions
  actionsSection:   document.getElementById('actions-section'),
  actionsList:      document.getElementById('actions-list'),
  btnAddAction:     document.getElementById('btn-add-action'),
  actionEditor:     document.getElementById('action-editor'),
  actionNameInput:  document.getElementById('action-name-input'),
  actionScriptInput:document.getElementById('action-script-input'),
  btnActionSave:    document.getElementById('btn-action-save'),
  btnActionCancel:  document.getElementById('btn-action-cancel'),
  btnImportActions: document.getElementById('btn-import-actions'),
  btnExportActions: document.getElementById('btn-export-actions'),
  // Update banner
  updateBanner:        document.getElementById('update-banner'),
  updateBannerText:    document.getElementById('update-banner-text'),
  updateBannerChannel: document.getElementById('update-banner-channel'),
  updateDownloadBtn:   document.getElementById('update-download-btn'),
  updateDismissBtn:    document.getElementById('update-dismiss-btn'),
};

// ===== Terminal Management =====

function loadXtermCSS() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../../node_modules/@xterm/xterm/css/xterm.css';
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadXtermModules() {
  loadXtermCSS();
  await loadScript('../../node_modules/@xterm/xterm/lib/xterm.js');
  await loadScript('../../node_modules/@xterm/addon-fit/lib/addon-fit.js');
  await loadScript('../../node_modules/@xterm/addon-web-links/lib/addon-web-links.js');
  await loadScript('../../node_modules/@xterm/addon-search/lib/addon-search.js');
}

function createTerminalInstance() {
  const activeTheme = THEMES[state.currentTheme] || THEMES['catppuccin-mocha'];
  const term = new Terminal({
    fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Consolas', monospace",
    fontSize: 14,
    lineHeight: 1.3,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    scrollback: 5000,
    convertEol: false,
    theme: activeTheme.terminal,
  });

  const fitAddon = new FitAddon.FitAddon();
  const webLinksAddon = new WebLinksAddon.WebLinksAddon();
  const searchAddon = new SearchAddon.SearchAddon();

  term.loadAddon(fitAddon);
  term.loadAddon(webLinksAddon);
  term.loadAddon(searchAddon);

  return { term, fitAddon, searchAddon };
}

async function createTab(options = {}) {
  const tabId = ++tabIdCounter;
  const protocol = options.protocol || 'local';
  const isSerial = protocol === 'serial';

  const defaultName = isSerial
    ? `${(options.connectionProfile?.serialPort || 'serial').split('/').pop()} @ ${options.connectionProfile?.baudRate || '115200'}`
    : (protocol === 'local' ? 'Terminal' : options.host || 'Connection');
  const name = options.name || defaultName;

  const pane = document.createElement('div');
  pane.className = 'terminal-pane';
  pane.id = `terminal-pane-${tabId}`;
  dom.terminalContainer.appendChild(pane);

  // Filter bar (created for every tab; only shown for serial tabs when activated)
  const filterBar = document.createElement('div');
  filterBar.className = 'serial-filter-bar hidden';
  filterBar.innerHTML = `
    <svg class="filter-icon" width="13" height="13" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2.5">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
    <input class="filter-input" type="text" placeholder="Filter output… (text or /regex/)" spellcheck="false">
    <button class="filter-regex-btn" title="Toggle regex mode">.*</button>
    <span class="filter-stats"></span>
    <button class="filter-clear-btn" title="Disable filter">✕</button>
  `;
  pane.appendChild(filterBar);

  // xterm renders into the viewport div (flex:1 sibling of filter bar)
  const viewport = document.createElement('div');
  viewport.className = 'terminal-viewport';
  pane.appendChild(viewport);

  const { term, fitAddon, searchAddon } = createTerminalInstance();
  term.open(viewport);

  const tab = {
    id: tabId,
    ptyId: null,
    serialId: null,
    isSerial,
    protocol,
    name,
    term,
    fitAddon,
    searchAddon,
    pane,
    filterBar,
    connectionProfile: options.connectionProfile || null,
    activeTransferId: null,
    // Serial output filter state
    filterActive:     false,
    filterPattern:    '',
    filterIsRegex:    false,
    filterLineBuffer: '',
    filterMatchCount: 0,
    filterTotalCount: 0,
    _filterRegex:     null,
  };

  if (isSerial) {
    // --- Serial path ---
    const cp = options.connectionProfile;
    let serialResult;
    try {
      serialResult = await window.terminalAPI.serialConnect({
        port: cp.serialPort,
        baudRate: cp.baudRate,
        dataBits: cp.dataBits,
        stopBits: cp.stopBits,
        parity: cp.parity,
        rtscts: cp.flowControl === 'hardware',
        xon: cp.flowControl === 'software',
      });
    } catch (err) {
      term.write(`\r\n\x1b[31m[Failed to open serial port: ${err.message}]\x1b[0m\r\n`);
      tab.ptyId = null;
      state.tabs.push(tab);
      renderTab(tab);
      activateTab(tabId);
      return;
    }

    tab.serialId = serialResult.id;

    // Wire serial filter bar controls
    const filterInput    = filterBar.querySelector('.filter-input');
    const filterRegexBtn = filterBar.querySelector('.filter-regex-btn');
    const filterClearBtn = filterBar.querySelector('.filter-clear-btn');

    filterInput.addEventListener('input', () => {
      tab.filterPattern    = filterInput.value;
      tab._filterRegex     = null;
      tab.filterMatchCount = 0;
      tab.filterTotalCount = 0;
      if (tab.filterIsRegex && tab.filterPattern) {
        try {
          tab._filterRegex = new RegExp(tab.filterPattern, 'i');
          filterInput.classList.remove('invalid');
        } catch {
          filterInput.classList.add('invalid');
          // invalid regex → show all lines until user corrects it
        }
      } else {
        filterInput.classList.remove('invalid');
      }
      updateSerialFilterStats(tab);
    });

    filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') disableSerialFilter(tab);
    });

    filterRegexBtn.addEventListener('click', () => {
      tab.filterIsRegex = !tab.filterIsRegex;
      tab._filterRegex  = null;
      filterRegexBtn.classList.toggle('active', tab.filterIsRegex);
      filterInput.dispatchEvent(new Event('input')); // re-validate
    });

    filterClearBtn.addEventListener('click', () => disableSerialFilter(tab));

    const removeDataListener = window.terminalAPI.onSerialData(({ id, data }) => {
      if (id !== tab.serialId) return;
      // Raw data is always logged before filtering (filter only affects display)
      if (tab.logId) window.terminalAPI.logWrite(tab.logId, data);
      if (tab.filterActive && tab.filterPattern) {
        writeSerialFiltered(tab, data);
      } else {
        term.write(data);
      }
    });
    const removeExitListener = window.terminalAPI.onSerialExit(({ id, error }) => {
      if (id !== tab.serialId) return;
      term.write(`\r\n\x1b[31m[Serial port closed${error ? ': ' + error : ''}]\x1b[0m\r\n`);
      tab.serialId = null;
      if (typeof removeDataListener === 'function') removeDataListener();
      if (typeof removeExitListener === 'function') removeExitListener();
      showExitMessage(tab, null);
    });

    // Use tab.serialId (not a local const) so reconnect can update it transparently
    term.onData((data) => {
      if (tab.serialId) window.terminalAPI.serialWrite(tab.serialId, data);
    });

    // Clipboard shortcuts for serial.
    // Cmd+V is handled by xterm's native paste event → term.onData → serialWrite.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.metaKey && e.key === 'c') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        return true;
      }
      return true;
    });

    setTimeout(() => fitAddon.fit(), 50);

  } else {
    // --- PTY path (SSH / Telnet / FTP / local) ---
    let shellCommand = null;
    let shellArgs = [];
    let extraEnv = {};

    let cleanupFiles = [];
    if (options.connectionProfile) {
      const commandInfo = await window.terminalAPI.connect(options.connectionProfile);
      shellCommand  = commandInfo.command;
      shellArgs     = commandInfo.args;
      extraEnv      = commandInfo.env || {};
      cleanupFiles  = commandInfo._cleanupFiles || [];
    }

    // Pre-fit: get correct dimensions before spawning the PTY.
    // The pane is display:block (visibility:hidden) so the container has real
    // layout dimensions and xterm has already measured cell size via term.open().
    // Without this, term.cols/rows default to 80×24 and the shell starts narrow.
    const proposed = fitAddon.proposeDimensions();
    if (proposed && proposed.cols > 0) {
      term.resize(proposed.cols, proposed.rows);
    }

    const ptyOptions = {
      cols: term.cols,
      rows: term.rows,
      cwd: options.cwd || null,
    };

    if (shellCommand) {
      ptyOptions.shell         = shellCommand;
      ptyOptions.args          = shellArgs;
      ptyOptions.env           = extraEnv;
      ptyOptions._cleanupFiles = cleanupFiles;
    }

    const result = await window.terminalAPI.createTerminal(ptyOptions);
    tab.ptyId = result.id;

    // Arm auto-type for SSH connections with a saved password.
    // Cleared in onTerminalData after first use so it fires exactly once.
    const cp = options.connectionProfile;
    if (cp && cp.password && cp.protocol === 'ssh' && cp.authType === 'password') {
      tab._pendingPassword = cp.password;
    }

    // Show the exact command being run so SSH errors are self-explanatory
    if (shellCommand && result.debugCmd) {
      term.writeln(`\x1b[90m▶ ${result.debugCmd}\x1b[0m`);
    }

    // Use tab.ptyId (not a local const) so reconnect can update it transparently
    term.onData((data) => {
      if (tab.ptyId) window.terminalAPI.sendInput(tab.ptyId, data);
    });

    // Clipboard shortcuts — must be set up after ptyId is known.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      // Cmd+C: copy selection; if no selection, let Ctrl+C reach PTY as SIGINT
      if (e.metaKey && e.key === 'c') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        return true;
      }
      // Cmd+V: return false so xterm does NOT fire its own internal paste on top
      // of the Electron menu role:paste event (which already delivers one paste).
      // This prevents the double-paste that garbles multi-line content.
      if (e.metaKey && e.key === 'v') {
        return false;
      }
      return true;
    });

  }

  state.tabs.push(tab);
  flushPendingTerminalEvents(tab);
  renderTab(tab);
  activateTab(tabId);

  const resizeObserver = new ResizeObserver(() => {
    if (state.activeTabId === tabId) {
      // rAF ensures layout has settled before FitAddon measures the container,
      // preventing cols miscalculation that causes wrong line-wrap points
      requestAnimationFrame(() => {
        fitAddon.fit();
        if (tab.ptyId) window.terminalAPI.resizeTerminal(tab.ptyId, term.cols, term.rows);
      });
    }
  });
  resizeObserver.observe(pane);
  tab.resizeObserver = resizeObserver;

  // Drag-and-drop file upload for SSH tabs
  setupPaneDragDrop(pane, tab);

  // Auto-copy on selection (PuTTY / Linux terminal style)
  term.onSelectionChange(() => {
    const sel = term.getSelection();
    if (sel) navigator.clipboard.writeText(sel).catch(() => {});
  });

  // Right-click: always show context menu
  pane.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTerminalContextMenu(e.clientX, e.clientY, term, tab);
  });

  // Middle-click: paste clipboard (PuTTY / Linux terminal style)
  pane.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    navigator.clipboard.readText().then((text) => {
      if (!text) return;
      if (tab.isSerial && tab.serialId) {
        window.terminalAPI.serialWrite(tab.serialId, text);
      } else if (tab.ptyId) {
        // Use term.paste() so bracketed paste mode is respected — this tells
        // the shell to treat the content as a single paste block rather than
        // individual keystrokes, preventing garbled multi-line content.
        term.paste(text);
      }
    }).catch(() => {});
  });

  return tab;
}

// ===== Drag-and-Drop File Upload =====

// ===== Upload Queue (multi-file / directory support) =====

function startUploadQueue(items, pane, tab) {
  tab.uploadQueue = [...items];
  tab.uploadTotal = items.length;
  tab.uploadIndex = 0;
  processNextUpload(pane, tab);
}

async function processNextUpload(pane, tab) {
  if (tab.uploadIndex >= (tab.uploadQueue || []).length) return;
  const { filePath, name } = tab.uploadQueue[tab.uploadIndex];
  const label = tab.uploadTotal > 1
    ? `${name}  (${tab.uploadIndex + 1} of ${tab.uploadTotal})`
    : name;
  showUploadProgressOverlay(pane, label, tab);
  const result = await window.terminalAPI.scpUpload(
    filePath, name, tab._uploadProfile, tab._uploadRemoteCwd
  );
  if (result.error) {
    completeUploadOverlay(pane, false, result.error);
    tab.uploadQueue = [];
    return;
  }
  tab.activeTransferId = result.transferId;
  pane.dataset.transferId = String(result.transferId);
}

function advanceUploadQueue(tab, pane, success, error) {
  tab.activeTransferId = null;
  delete pane.dataset.transferId;
  if (!success) {
    completeUploadOverlay(pane, false, error);
    tab.uploadQueue = [];
    return;
  }
  tab.uploadIndex = (tab.uploadIndex || 0) + 1;
  if (tab.uploadIndex < (tab.uploadQueue || []).length) {
    processNextUpload(pane, tab);
  } else {
    completeUploadOverlay(pane, true, null);
    tab.uploadQueue = [];
  }
}

function setupPaneDragDrop(pane, tab) {
  // Use capture:true so these fire in the top-down phase, before xterm.js
  // can stop bubbling on its canvas/viewport elements.
  const CAPTURE = { capture: true };

  pane.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, CAPTURE);

  pane.addEventListener('dragenter', (e) => {
    e.preventDefault();
    // relatedTarget is the element the cursor came FROM.
    // Only show overlay when entering pane from outside (not moving between children).
    if (!pane.contains(e.relatedTarget) && isSSHTab(tab)) {
      showDropZoneOverlay(pane);
    }
  }, CAPTURE);

  pane.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // relatedTarget is the element the cursor is going TO.
    // Only hide overlay when the cursor fully leaves the pane.
    if (!pane.contains(e.relatedTarget)) {
      removeOverlay(pane, 'drop-zone-overlay');
    }
  }, CAPTURE);

  pane.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeOverlay(pane, 'drop-zone-overlay');

    if (!isSSHTab(tab)) {
      showTransferToast(pane, 'File upload is only available for SSH connections', true);
      return;
    }

    if (tab.activeTransferId) {
      showTransferToast(pane, 'A transfer is already in progress', true);
      return;
    }

    const items = Array.from(e.dataTransfer.files)
      .map(f => ({ filePath: window.terminalAPI.getPathForFile(f), name: f.name }))
      .filter(i => i.filePath);

    if (items.length === 0) {
      showTransferToast(pane, 'No files detected — try again', true);
      return;
    }

    // Prepare profile for SCP (handle pasted key)
    const profile = { ...tab.connectionProfile };
    if (profile.pemText && !profile.pemFile) {
      profile.pemFile = await window.terminalAPI.saveTempKey(profile.pemText);
    }

    // Detect current remote working directory
    const remoteCwd = await window.terminalAPI.getRemoteCwd(tab.ptyId);

    tab._uploadProfile   = profile;
    tab._uploadRemoteCwd = remoteCwd;
    startUploadQueue(items, pane, tab);
  }, CAPTURE);
}

function isSSHTab(tab) {
  return tab.connectionProfile &&
    tab.connectionProfile.protocol === 'ssh';
}

function showDropZoneOverlay(pane) {
  if (pane.querySelector('.drop-zone-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'drop-zone-overlay';
  overlay.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="16 16 12 12 8 16"></polyline>
      <line x1="12" y1="12" x2="12" y2="21"></line>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
    </svg>
    <span>Drop files or folders to upload via SCP</span>
  `;
  pane.appendChild(overlay);
}

function showUploadProgressOverlay(pane, fileName, tab) {
  removeOverlay(pane, 'upload-progress-overlay');
  const overlay = document.createElement('div');
  overlay.className = 'upload-progress-overlay';
  overlay.innerHTML = `
    <div class="upload-info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 16 12 12 8 16"></polyline>
        <line x1="12" y1="12" x2="12" y2="21"></line>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
      </svg>
      <span class="upload-file-name">${escapeHTML(fileName)}</span>
      <span class="upload-percent">0%</span>
    </div>
    <div class="upload-progress-bar">
      <div class="upload-progress-fill" style="width: 0%"></div>
    </div>
    <button class="upload-cancel-btn" title="Cancel transfer">&times;</button>
  `;
  overlay.querySelector('.upload-cancel-btn').addEventListener('click', () => {
    if (tab.activeTransferId) {
      window.terminalAPI.scpCancel(tab.activeTransferId);
      tab.activeTransferId = null;
    }
    removeOverlay(pane, 'upload-progress-overlay');
  });
  pane.appendChild(overlay);
}

function updateUploadProgress(pane, percent) {
  const overlay = pane.querySelector('.upload-progress-overlay');
  if (!overlay) return;
  const fill = overlay.querySelector('.upload-progress-fill');
  const pctText = overlay.querySelector('.upload-percent');
  if (fill) fill.style.width = percent + '%';
  if (pctText) pctText.textContent = percent + '%';
}

function completeUploadOverlay(pane, success, error) {
  const overlay = pane.querySelector('.upload-progress-overlay');
  if (!overlay) return;

  if (success) {
    overlay.classList.add('success');
    const fill = overlay.querySelector('.upload-progress-fill');
    const pctText = overlay.querySelector('.upload-percent');
    if (fill) fill.style.width = '100%';
    if (pctText) pctText.textContent = 'Done';
    const cancelBtn = overlay.querySelector('.upload-cancel-btn');
    if (cancelBtn) cancelBtn.remove();
    setTimeout(() => removeOverlay(pane, 'upload-progress-overlay'), 3000);
  } else {
    overlay.classList.add('error');
    const pctText = overlay.querySelector('.upload-percent');
    if (pctText) pctText.textContent = 'Failed';
    const cancelBtn = overlay.querySelector('.upload-cancel-btn');
    if (cancelBtn) {
      cancelBtn.textContent = 'Dismiss';
      cancelBtn.addEventListener('click', () => removeOverlay(pane, 'upload-progress-overlay'));
    }
  }
}

function showTransferToast(pane, message, isError) {
  const toast = document.createElement('div');
  toast.className = 'upload-toast' + (isError ? ' error' : '');
  toast.textContent = message;
  pane.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function removeOverlay(pane, className) {
  const el = pane.querySelector('.' + className);
  if (el) el.remove();
}

function renderTab(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = tab.id;

  const protocolBadge = document.createElement('span');
  protocolBadge.className = `tab-protocol ${tab.protocol}`;
  protocolBadge.textContent = tab.protocol.toUpperCase();

  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = tab.name;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tab.id);
  });

  tabEl.addEventListener('click', () => activateTab(tab.id));

  // Drag tab downward to tear it off into a new window
  tabEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !tab.connectionProfile) return;
    e.preventDefault();

    const DRAG_START_PX = 8;
    const TEAROFF_PX    = 70; // px below tab bar bottom triggers tear-off
    let dragging = false;
    let tearOff  = false;
    let ghost    = null;

    const onMove = (ev) => {
      const dy = Math.abs(ev.clientY - e.clientY);
      const dx = Math.abs(ev.clientX - e.clientX);
      if (!dragging && (dy > DRAG_START_PX || dx > DRAG_START_PX)) {
        dragging = true;
        ghost = document.createElement('div');
        ghost.className = 'tab-drag-ghost';
        ghost.textContent = tab.name;
        document.body.appendChild(ghost);
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top  = `${ev.clientY + 14}px`;
      const tabBarBottom = dom.tabsContainer.getBoundingClientRect().bottom;
      if (ev.clientY > tabBarBottom + TEAROFF_PX) {
        tearOff = true;
        ghost.classList.add('tear-off');
        ghost.textContent = `${tab.name}  →  New Window`;
      } else {
        tearOff = false;
        ghost.classList.remove('tear-off');
        ghost.textContent = tab.name;
      }
    };

    // Use capture phase so xterm.js stopPropagation on its canvas can't swallow the mouseup
    const OPTS = { capture: true };

    const onUp = async (ev) => {
      document.removeEventListener('mousemove', onMove, OPTS);
      document.removeEventListener('mouseup', onUp, OPTS);
      if (ghost) { ghost.remove(); ghost = null; }
      if (tearOff) {
        ev.stopPropagation();
        ev.preventDefault();
        await window.terminalAPI.openNewWindow(tab.connectionProfile);
        closeTab(tab.id);
      }
    };

    document.addEventListener('mousemove', onMove, OPTS);
    document.addEventListener('mouseup', onUp, OPTS);
  });

  tabEl.appendChild(protocolBadge);
  tabEl.appendChild(titleSpan);
  tabEl.appendChild(closeBtn);
  dom.tabsContainer.appendChild(tabEl);
}

function activateTab(tabId) {
  state.activeTabId = tabId;

  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.tabId) === tabId);
  });

  state.tabs.forEach((tab) => {
    tab.pane.classList.toggle('active', tab.id === tabId);
    if (tab.id === tabId) {
      // rAF lets the browser apply the visibility change and settle layout
      // before FitAddon measures. This keeps cols accurate when switching tabs.
      requestAnimationFrame(() => {
        tab.fitAddon.fit();
        // Push updated dimensions to the PTY so the shell redraws correctly
        if (tab.ptyId) {
          window.terminalAPI.resizeTerminal(tab.ptyId, tab.term.cols, tab.term.rows);
        }
        tab.term.focus();
      });
    }
  });
}

function closeTab(tabId) {
  const index = state.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return;

  const tab = state.tabs[index];

  if (tab.logId) {
    window.terminalAPI.logStop(tab.logId);
    tab.logId = null;
  }
  if (tab.isSerial && tab.serialId) {
    window.terminalAPI.serialClose(tab.serialId);
  } else if (tab.ptyId) {
    window.terminalAPI.killTerminal(tab.ptyId);
  }

  if (tab.resizeObserver) {
    tab.resizeObserver.disconnect();
  }
  tab.term.dispose();
  tab.pane.remove();

  const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabEl) tabEl.remove();

  state.tabs.splice(index, 1);

  if (state.activeTabId === tabId) {
    if (state.tabs.length > 0) {
      const newIndex = Math.min(index, state.tabs.length - 1);
      activateTab(state.tabs[newIndex].id);
    } else {
      state.activeTabId = null;
      showEmptyState();
    }
  }
}

function showEmptyState() {
  const existing = dom.terminalContainer.querySelector('.empty-state');
  if (existing) return;

  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.innerHTML = `
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
    <h3>No terminals open</h3>
    <p>Press <span class="shortcut">\u2318 T</span> for a new terminal<br>
    Press <span class="shortcut">\u2318 K</span> to open the Connection Manager<br>
    Double-click a host in the sidebar to connect</p>
  `;
  dom.terminalContainer.appendChild(emptyState);
}

function removeEmptyState() {
  const existing = dom.terminalContainer.querySelector('.empty-state');
  if (existing) existing.remove();
}

// ===== Add Selection as Action (mini-dialog) =====

function showAddSelectionAsActionDialog(x, y, script, tab) {
  document.querySelector('.add-action-dialog')?.remove();

  const dlg = document.createElement('div');
  dlg.className = 'add-action-dialog';
  dlg.innerHTML = `
    <div class="add-action-dialog-title">Save as Action</div>
    <input type="text" class="add-action-name-input" maxlength="20"
      placeholder="Action name (max 20 chars)" autocomplete="off">
    <textarea class="add-action-script-preview" rows="3" readonly></textarea>
    <div class="add-action-dialog-btns">
      <button class="btn btn-secondary btn-sm add-action-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm add-action-save">Save</button>
    </div>
  `;
  dlg.querySelector('.add-action-script-preview').value = script;

  // Position — keep inside viewport
  const dlgW = 260, dlgH = 160;
  dlg.style.left = `${Math.min(x, window.innerWidth  - dlgW - 10)}px`;
  dlg.style.top  = `${Math.min(y, window.innerHeight - dlgH - 10)}px`;
  document.body.appendChild(dlg);

  const nameInput = dlg.querySelector('.add-action-name-input');
  nameInput.focus();

  const close = () => dlg.remove();

  dlg.querySelector('.add-action-cancel').addEventListener('click', close);

  dlg.querySelector('.add-action-save').addEventListener('click', () => {
    const name = nameInput.value.trim().slice(0, 20);
    if (!name) { nameInput.focus(); return; }

    // Add action directly to this tab's connectionProfile
    if (!Array.isArray(tab.connectionProfile.actions)) {
      tab.connectionProfile.actions = [];
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    tab.connectionProfile.actions.push({ id, name, script });

    // Persist: update matching profile in state.profiles and save to disk
    const profileIdx = state.profiles.findIndex(p => p.id === tab.connectionProfile.id);
    if (profileIdx !== -1) {
      state.profiles[profileIdx] = { ...tab.connectionProfile };
      saveAllProfiles();
    }

    close();
  });

  // Close on Escape
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter')  dlg.querySelector('.add-action-save').click();
  });

  // Close when clicking outside
  const onOutside = (e) => {
    if (!dlg.contains(e.target)) { close(); document.removeEventListener('mousedown', onOutside); }
  };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

// ===== Serial Output Filter =====

/**
 * Write incoming serial data through the active line filter.
 * Only lines matching tab.filterPattern are forwarded to xterm.
 * Buffers incomplete lines across IPC data chunks.
 */
function writeSerialFiltered(tab, data) {
  tab.filterLineBuffer += data;
  const lines = tab.filterLineBuffer.split('\n');
  tab.filterLineBuffer = lines.pop(); // hold back the last incomplete chunk

  for (const line of lines) {
    tab.filterTotalCount++;
    if (serialLineMatchesFilter(line, tab)) {
      tab.filterMatchCount++;
      tab.term.write(line + '\n');
    }
  }
  updateSerialFilterStats(tab);
}

/** Test one complete line against the tab's filter (text or regex). */
function serialLineMatchesFilter(line, tab) {
  // Strip ANSI escape codes before matching so colour sequences don't interfere
  const plain = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
  if (tab.filterIsRegex) {
    if (!tab._filterRegex) return true; // invalid regex → show all
    return tab._filterRegex.test(plain);
  }
  return plain.toLowerCase().includes(tab.filterPattern.toLowerCase());
}

/** Update the "12/50" matched/total counter in the filter bar. */
function updateSerialFilterStats(tab) {
  const el = tab.filterBar?.querySelector('.filter-stats');
  if (el) el.textContent = `${tab.filterMatchCount}/${tab.filterTotalCount}`;
}

/** Show the filter bar and focus the input for a serial tab. */
function enableSerialFilter(tab) {
  if (!tab.isSerial || !tab.filterBar) return;
  tab.filterActive     = true;
  tab.filterLineBuffer = '';
  tab.filterMatchCount = 0;
  tab.filterTotalCount = 0;
  tab._filterRegex     = null;
  tab.filterBar.classList.remove('hidden');
  requestAnimationFrame(() => {
    tab.fitAddon.fit();
    tab.filterBar.querySelector('.filter-input').focus();
  });
}

/** Hide the filter bar and restore full terminal height. */
function disableSerialFilter(tab) {
  if (!tab.filterBar) return;
  tab.filterActive     = false;
  tab.filterPattern    = '';
  tab.filterLineBuffer = '';
  tab._filterRegex     = null;
  const bar = tab.filterBar;
  bar.classList.add('hidden');
  bar.querySelector('.filter-input').value = '';
  bar.querySelector('.filter-input').classList.remove('invalid');
  bar.querySelector('.filter-stats').textContent = '';
  bar.querySelector('.filter-regex-btn').classList.remove('active');
  requestAnimationFrame(() => {
    tab.fitAddon.fit();
    tab.term.focus();
  });
}

// ===== Terminal Context Menu =====

function showTerminalContextMenu(x, y, term, tab) {
  document.querySelector('.terminal-context-menu')?.remove();

  const hasSel = term.hasSelection();
  const isLogging = !!tab.logId;
  const actions = (tab.connectionProfile && Array.isArray(tab.connectionProfile.actions))
    ? tab.connectionProfile.actions
    : [];
  const hasActions = actions.length > 0;
  const canAddAsAction = hasSel && !!(tab.connectionProfile?.id);

  const menu = document.createElement('div');
  menu.className = 'terminal-context-menu';
  menu.innerHTML = `
    <button class="ctx-copy" ${hasSel ? '' : 'disabled'}>
      Copy <span class="ctx-shortcut">⌘C</span>
    </button>
    <button class="ctx-paste">
      Paste <span class="ctx-shortcut">⌘V</span>
    </button>
    ${canAddAsAction ? '<button class="ctx-add-as-action">Add as Action…</button>' : ''}
    ${hasActions ? '<button class="ctx-actions-trigger">Actions</button>' : ''}
    <div class="ctx-divider"></div>
    <button class="ctx-log-start" ${isLogging ? 'disabled' : ''}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="6" fill="${isLogging ? 'none' : 'currentColor'}"></circle>
      </svg>
      Start Logging
    </button>
    <button class="ctx-log-stop" ${isLogging ? '' : 'disabled'}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="5" y="5" width="14" height="14" rx="1"></rect>
      </svg>
      Stop Logging
    </button>
    ${tab.isSerial ? `
    <div class="ctx-divider"></div>
    <button class="ctx-filter-toggle">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      ${tab.filterActive ? 'Disable Filter' : 'Filter Output…'}
    </button>
    ` : ''}
  `;

  const sendText = (text) => {
    if (!text) return;
    if (tab.isSerial && tab.serialId) {
      window.terminalAPI.serialWrite(tab.serialId, text);
    } else if (tab.ptyId) {
      // Use term.paste() so bracketed paste mode wraps multi-line content
      // correctly, preventing garbled output in shells and python -c invocations.
      term.paste(text);
    }
  };

  menu.querySelector('.ctx-copy').addEventListener('click', () => {
    if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
    menu.remove();
  });
  menu.querySelector('.ctx-paste').addEventListener('click', () => {
    navigator.clipboard.readText().then(sendText).catch(() => {});
    menu.remove();
  });

  if (canAddAsAction) {
    const selection = term.getSelection();
    menu.querySelector('.ctx-add-as-action').addEventListener('click', () => {
      menu.remove();
      showAddSelectionAsActionDialog(x, y, selection, tab);
    });
  }

  // Actions submenu
  if (hasActions) {
    const trigger = menu.querySelector('.ctx-actions-trigger');

    trigger.addEventListener('mouseenter', () => {
      // Remove any existing submenu
      menu.querySelector('.ctx-actions-submenu')?.remove();

      const sub = document.createElement('div');
      sub.className = 'ctx-actions-submenu';

      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'ctx-actions-item';
        btn.textContent = action.name;
        btn.title = action.script; // tooltip shows full script
        btn.addEventListener('click', () => {
          menu.remove();
          sendText(action.script);
        });
        sub.appendChild(btn);
      });

      // Viewport-aware: flip left if submenu would overflow right edge
      trigger.appendChild(sub);
      const triggerRect = trigger.getBoundingClientRect();
      const subWidth = sub.offsetWidth || 200;
      if (triggerRect.right + subWidth > window.innerWidth) {
        sub.style.left  = 'auto';
        sub.style.right = '100%';
      }
    });

    trigger.addEventListener('mouseleave', (e) => {
      // Keep submenu open when mouse moves into it
      if (!trigger.contains(e.relatedTarget)) {
        menu.querySelector('.ctx-actions-submenu')?.remove();
      }
    });
  }

  menu.querySelector('.ctx-log-start').addEventListener('click', async () => {
    menu.remove();
    const result = await window.terminalAPI.logStart();
    if (!result) return; // user cancelled
    tab.logId = result.logId;
    tab.logPath = result.filePath;
    showLogBadge(tab);
  });

  menu.querySelector('.ctx-log-stop').addEventListener('click', () => {
    menu.remove();
    if (!tab.logId) return;
    window.terminalAPI.logStop(tab.logId);
    tab.logId = null;
    tab.logPath = null;
    removeLogBadge(tab);
  });

  // Filter toggle (serial tabs only)
  menu.querySelector('.ctx-filter-toggle')?.addEventListener('click', () => {
    menu.remove();
    tab.filterActive ? disableSerialFilter(tab) : enableSerialFilter(tab);
  });

  // Position menu — keep it inside the viewport
  const menuWidth  = 160;
  const menuHeight = hasActions ? 160 : 130;
  menu.style.left = `${Math.min(x, window.innerWidth  - menuWidth)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - menuHeight)}px`;
  document.body.appendChild(menu);

  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function showLogBadge(tab) {
  removeLogBadge(tab);
  const badge = document.createElement('div');
  badge.className = 'log-active-badge';
  badge.title = `Logging to: ${tab.logPath}`;
  badge.innerHTML = `
    <span class="log-dot"></span>
    <span>REC</span>
  `;
  tab.pane.appendChild(badge);
}

function removeLogBadge(tab) {
  tab.pane?.querySelector('.log-active-badge')?.remove();
}

// ===== Terminal Exit Helper =====

async function reconnectTab(tab) {
  tab.term.write('\r\n\x1b[90m────────────── Reconnecting... ──────────────\x1b[0m\r\n');
  try {
    if (tab.isSerial) {
      const cp = tab.connectionProfile;
      const serialResult = await window.terminalAPI.serialConnect({
        port:     cp.serialPort,
        baudRate: cp.baudRate,
        dataBits: cp.dataBits,
        stopBits: cp.stopBits,
        parity:   cp.parity,
        rtscts:   cp.flowControl === 'hardware',
        xon:      cp.flowControl === 'software',
      });
      tab.serialId = serialResult.id;

      // Re-attach serial listeners for the new connection
      const removeDataListener = window.terminalAPI.onSerialData(({ id, data }) => {
        if (id !== tab.serialId) return;
        tab.term.write(data);
        if (tab.logId) window.terminalAPI.logWrite(tab.logId, data);
      });
      const removeExitListener = window.terminalAPI.onSerialExit(({ id, error }) => {
        if (id !== tab.serialId) return;
        tab.term.write(`\r\n\x1b[31m[Serial port closed${error ? ': ' + error : ''}]\x1b[0m\r\n`);
        tab.serialId = null;
        if (typeof removeDataListener === 'function') removeDataListener();
        if (typeof removeExitListener === 'function') removeExitListener();
        showExitMessage(tab, null);
      });
    } else {
      let shellCommand = null, shellArgs = [], extraEnv = {}, cleanupFiles = [];
      if (tab.connectionProfile) {
        const commandInfo = await window.terminalAPI.connect(tab.connectionProfile);
        shellCommand = commandInfo.command;
        shellArgs    = commandInfo.args;
        extraEnv     = commandInfo.env || {};
        cleanupFiles = commandInfo._cleanupFiles || [];
      }
      const ptyOptions = {
        cols: tab.term.cols,
        rows: tab.term.rows,
        cwd:  tab.connectionProfile?.cwd || null,
      };
      if (shellCommand) {
        ptyOptions.shell         = shellCommand;
        ptyOptions.args          = shellArgs;
        ptyOptions.env           = extraEnv;
        ptyOptions._cleanupFiles = cleanupFiles;
      }
      const result = await window.terminalAPI.createTerminal(ptyOptions);
      tab.ptyId = result.id;
      // Re-arm auto-type on reconnect
      if (tab.connectionProfile?.password &&
          tab.connectionProfile?.protocol === 'ssh' &&
          tab.connectionProfile?.authType === 'password') {
        tab._pendingPassword = tab.connectionProfile.password;
      }
      if (shellCommand && result.debugCmd) {
        tab.term.writeln(`\x1b[90m▶ ${result.debugCmd}\x1b[0m`);
      }
    }
  } catch (err) {
    tab.term.write(`\r\n\x1b[31m[Reconnect failed: ${err.message}]\x1b[0m\r\n`);
    showExitMessage(tab, null);
  }
}

function showExitMessage(tab, exitCode) {
  const codeStr = exitCode != null && exitCode !== 0 ? ` (code ${exitCode})` : '';
  const canReconnect = !!(tab.connectionProfile && tab.protocol !== 'local');

  if (canReconnect) {
    tab.term.write(
      `\r\n\x1b[90m[Process exited${codeStr}. Press R to reconnect or any key to close]\x1b[0m\r\n`
    );
    const listener = tab.term.onKey(({ domEvent }) => {
      listener.dispose();
      if (domEvent.key.toLowerCase() === 'r') {
        reconnectTab(tab);
      } else {
        closeTab(tab.id);
      }
    });
  } else {
    tab.term.write(
      `\r\n\x1b[90m[Process exited${codeStr}. Press any key to close]\x1b[0m\r\n`
    );
    tab.term.onKey(() => closeTab(tab.id));
  }
}

// Flush buffered data/exit events for a newly registered tab.
function flushPendingTerminalEvents(tab) {
  const { ptyId, term } = tab;
  const data = pendingTerminalData.get(ptyId);
  if (data) {
    data.forEach((chunk) => term.write(chunk));
    pendingTerminalData.delete(ptyId);
  }
  const exitInfo = pendingTerminalExit.get(ptyId);
  if (exitInfo) {
    pendingTerminalExit.delete(ptyId);
    showExitMessage(tab, exitInfo.exitCode);
  }
}

// ===== Terminal Data Listener =====

function setupTerminalListeners() {
  window.terminalAPI.onTerminalData(({ id, data }) => {
    const tab = state.tabs.find((t) => t.ptyId === id);
    if (tab) {
      // Auto-type SSH password when server prompts for it.
      // This is the most reliable injection method: it works regardless of SSH
      // version, OS patches (e.g. macOS Keychain-patched OpenSSH), or PTY nesting.
      // _pendingPassword is set when the tab is created with a password profile
      // and cleared after the first injection so it is sent exactly once.
      if (tab._pendingPassword && /[Pp]assword|\bassword:/i.test(data)) {
        const pwd = tab._pendingPassword;
        tab._pendingPassword = null;
        // Small delay so the prompt is fully rendered before we respond
        setTimeout(() => window.terminalAPI.sendInput(id, pwd + '\r'), 80);
      }

      tab.term.write(data);
      if (tab.logId) window.terminalAPI.logWrite(tab.logId, data);
    } else {
      // Process started before the tab was registered — buffer until flush
      if (!pendingTerminalData.has(id)) pendingTerminalData.set(id, []);
      pendingTerminalData.get(id).push(data);
    }
  });

  window.terminalAPI.onTerminalExit(({ id, exitCode }) => {
    const tab = state.tabs.find((t) => t.ptyId === id);
    if (tab) {
      showExitMessage(tab, exitCode);
    } else {
      pendingTerminalExit.set(id, { exitCode });
    }
  });

  // SCP drag-and-drop progress
  window.terminalAPI.onScpProgress(({ transferId, fileName, percent }) => {
    const tab = state.tabs.find(
      (t) => t.pane.dataset.transferId === String(transferId)
    );
    if (tab) {
      updateUploadProgress(tab.pane, percent);
    }
  });

  window.terminalAPI.onScpComplete(({ transferId, success, error }) => {
    const tab = state.tabs.find(
      (t) => t.pane.dataset.transferId === String(transferId)
    );
    if (tab) {
      advanceUploadQueue(tab, tab.pane, success, error);
    }
  });
}

// ===== Sidebar =====

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  dom.hostsSidebar.classList.toggle('collapsed', state.sidebarCollapsed);

  // Refit active terminal after transition
  setTimeout(() => {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (activeTab) {
      activeTab.fitAddon.fit();
      window.terminalAPI.resizeTerminal(activeTab.ptyId, activeTab.term.cols, activeTab.term.rows);
    }
  }, 250);
}

function getAllTags() {
  const tagMap = new Map();
  state.profiles.forEach((p) => {
    (p.tags || []).forEach((t) => {
      tagMap.set(t.name, t.color);
    });
  });
  return Array.from(tagMap.entries()).map(([name, color]) => ({ name, color }));
}

function renderSidebarTagFilters() {
  const allTags = getAllTags();
  dom.sidebarTagFilters.innerHTML = '';

  if (allTags.length === 0) return;

  // "All" chip always first
  const allChip = document.createElement('span');
  allChip.className = 'sidebar-tag-chip' + (state.activeTagFilter === null ? ' active' : '');
  allChip.style.background = '#cdd6f418';
  allChip.style.color = '#cdd6f4';
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => {
    state.activeTagFilter = null;
    renderSidebarTagFilters();
    renderSidebarHosts();
  });
  dom.sidebarTagFilters.appendChild(allChip);

  allTags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'sidebar-tag-chip';
    if (state.activeTagFilter === tag.name) {
      chip.classList.add('active');
    }
    chip.style.background = tag.color + '20';
    chip.style.color = tag.color;
    chip.textContent = tag.name;

    chip.addEventListener('click', () => {
      state.activeTagFilter = tag.name;
      renderSidebarTagFilters();
      renderSidebarHosts();
    });

    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTagContextMenu(e, tag, chip);
    });

    dom.sidebarTagFilters.appendChild(chip);
  });
}

function renderSidebarHosts() {
  const searchTerm = (dom.sidebarSearchInput.value || '').toLowerCase().trim();
  let profiles = state.profiles;

  if (searchTerm) {
    profiles = profiles.filter((p) =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.host || '').toLowerCase().includes(searchTerm) ||
      (p.username || '').toLowerCase().includes(searchTerm)
    );
  }

  if (state.activeTagFilter) {
    profiles = profiles.filter((p) =>
      (p.tags || []).some((t) => t.name === state.activeTagFilter)
    );
  }

  dom.sidebarHostsList.innerHTML = '';

  if (profiles.length === 0) {
    dom.sidebarHostsList.innerHTML = `<div class="sidebar-empty">${
      searchTerm || state.activeTagFilter ? 'No matching hosts' : 'No saved hosts'
    }</div>`;
    return;
  }

  // Group by protocol
  const groups = { ssh: [], telnet: [], ftp: [] };
  profiles.forEach((p) => {
    const key = p.protocol || 'ssh';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const protocolLabels = {
    ssh: 'SSH / SFTP / SCP',
    telnet: 'Telnet',
    ftp: 'FTP',
  };

  Object.entries(groups).forEach(([proto, items]) => {
    if (items.length === 0) return;

    const group = document.createElement('div');
    group.className = 'sidebar-group';

    const isCollapsed = state.collapsedGroups[proto] || false;

    const header = document.createElement('div');
    header.className = 'sidebar-group-header' + (isCollapsed ? ' collapsed' : '');
    header.innerHTML = `
      <svg class="group-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      ${protocolLabels[proto] || proto.toUpperCase()}
      <span class="group-count">${items.length}</span>
    `;

    header.addEventListener('click', () => {
      state.collapsedGroups[proto] = !state.collapsedGroups[proto];
      header.classList.toggle('collapsed');
      itemsContainer.style.display = state.collapsedGroups[proto] ? 'none' : '';
    });

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'sidebar-group-items';
    if (isCollapsed) itemsContainer.style.display = 'none';

    items.forEach((profile) => {
      const host = document.createElement('div');
      host.className = 'sidebar-host';

      const tagDots = (profile.tags || []).map((t) =>
        `<span class="host-tag-dot" style="background:${escapeHtml(t.color)}" title="${escapeHtml(t.name)}"></span>`
      ).join('');

      host.innerHTML = `
        <span class="host-dot ${proto}"></span>
        <div class="host-info">
          <span class="host-label">${escapeHtml(profile.name || profile.host)}</span>
          <span class="host-address">${escapeHtml(profile.username ? profile.username + '@' : '')}${escapeHtml(profile.host)}</span>
        </div>
        <div class="host-tags">${tagDots}</div>
      `;

      host.addEventListener('dblclick', () => {
        quickConnect(profile);
      });

      host.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showHostContextMenu(e, profile);
      });

      itemsContainer.appendChild(host);
    });

    group.appendChild(header);
    group.appendChild(itemsContainer);
    dom.sidebarHostsList.appendChild(group);
  });
}

async function quickConnect(profile) {
  removeEmptyState();

  // If profile has pasted key text, save to temp file
  const connectionProfile = { ...profile };
  if (connectionProfile.pemText && !connectionProfile.pemFile) {
    connectionProfile.pemFile = await window.terminalAPI.saveTempKey(connectionProfile.pemText);
  }

  let tabProtocol = connectionProfile.protocol;
  if (connectionProfile.protocol === 'ssh' && connectionProfile.sshMode) {
    tabProtocol = connectionProfile.sshMode === 'terminal' ? 'ssh' : connectionProfile.sshMode;
  }

  await createTab({
    protocol: tabProtocol,
    name: connectionProfile.name || connectionProfile.host,
    host: connectionProfile.host,
    connectionProfile,
  });
}

// ===== Context Menu =====

function showHostContextMenu(e, profile) {
  // Remove any existing context menu
  dismissContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  const connectItem = document.createElement('div');
  connectItem.className = 'context-menu-item';
  connectItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>
    </svg>
    Connect
  `;
  connectItem.addEventListener('click', () => {
    dismissContextMenu();
    quickConnect(profile);
  });

  const editItem = document.createElement('div');
  editItem.className = 'context-menu-item';
  editItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
    Edit
  `;
  editItem.addEventListener('click', () => {
    dismissContextMenu();
    openConnectionManager(profile);
  });

  const deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item danger';
  deleteItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
    Delete
  `;
  deleteItem.addEventListener('click', () => {
    dismissContextMenu();
    const confirmed = confirm(`Delete "${profile.name || profile.host}"?`);
    if (!confirmed) return;
    state.profiles = state.profiles.filter((p) => p.id !== profile.id);
    saveAllProfiles();
    renderProfilesList();
  });

  menu.appendChild(connectItem);
  menu.appendChild(editItem);
  menu.appendChild(deleteItem);
  document.body.appendChild(menu);

  // Adjust if overflows viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }

  // Dismiss on click outside
  setTimeout(() => {
    document.addEventListener('click', dismissContextMenu, { once: true });
    document.addEventListener('contextmenu', dismissContextMenu, { once: true });
  }, 0);
}

function dismissContextMenu() {
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();
}

// ===== Tag Context Menu (Rename / Delete) =====

function showTagContextMenu(e, tag, chipElement) {
  dismissContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  const renameItem = document.createElement('div');
  renameItem.className = 'context-menu-item';
  renameItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
    Rename
  `;
  renameItem.addEventListener('click', () => {
    dismissContextMenu();
    startInlineTagRename(tag, chipElement);
  });

  const deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item danger';
  deleteItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
    Delete from all hosts
  `;
  deleteItem.addEventListener('click', () => {
    dismissContextMenu();
    deleteTagGlobally(tag.name);
  });

  menu.appendChild(renameItem);
  menu.appendChild(deleteItem);
  document.body.appendChild(menu);

  // Adjust if menu overflows viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth)  menu.style.left = (window.innerWidth  - rect.width  - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top  = (window.innerHeight - rect.height - 8) + 'px';

  setTimeout(() => {
    document.addEventListener('click', dismissContextMenu, { once: true });
    document.addEventListener('contextmenu', dismissContextMenu, { once: true });
  }, 0);
}

function startInlineTagRename(tag, chipElement) {
  const input = document.createElement('input');
  input.className = 'tag-chip-rename-input';
  input.value = tag.name;

  chipElement.innerHTML = '';
  chipElement.appendChild(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== tag.name) {
      renameTagGlobally(tag.name, newName);
    } else {
      renderSidebarTagFilters(); // revert with no change
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { renderSidebarTagFilters(); }
  });
  input.addEventListener('blur', commit);
}

function renameTagGlobally(oldName, newName) {
  state.profiles = state.profiles.map((profile) => ({
    ...profile,
    tags: (profile.tags || []).map((t) =>
      t.name === oldName ? { ...t, name: newName } : t
    ),
  }));
  if (state.activeTagFilter === oldName) state.activeTagFilter = newName;
  saveAllProfiles();
}

function deleteTagGlobally(tagName) {
  state.profiles = state.profiles.map((profile) => ({
    ...profile,
    tags: (profile.tags || []).filter((t) => t.name !== tagName),
  }));
  if (state.activeTagFilter === tagName) state.activeTagFilter = null;
  saveAllProfiles();
}

// ===== Tags Management =====

function renderFormTags() {
  dom.connTagsList.innerHTML = '';
  state.currentTags.forEach((tag, index) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.style.background = tag.color + '25';
    pill.style.color = tag.color;
    pill.innerHTML = `${escapeHtml(tag.name)}<button class="tag-remove" data-index="${index}">&times;</button>`;
    dom.connTagsList.appendChild(pill);
  });

  // Wire remove buttons
  dom.connTagsList.querySelectorAll('.tag-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index);
      state.currentTags.splice(idx, 1);
      renderFormTags();
    });
  });
}

function addTag() {
  const name = dom.connTagInput.value.trim();
  if (!name) return;

  const color = dom.connTagColor.value;

  // Don't add duplicate names
  if (state.currentTags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    dom.connTagInput.value = '';
    hideTagSuggestions();
    return;
  }

  state.currentTags.push({ name, color });
  dom.connTagInput.value = '';
  hideTagSuggestions();
  renderFormTags();
}

function hideTagSuggestions() {
  dom.tagSuggestions.classList.add('hidden');
  dom.tagSuggestions.innerHTML = '';
}

function showTagSuggestions(filter) {
  const allExisting = getAllTags();
  const already = new Set(state.currentTags.map((t) => t.name.toLowerCase()));
  const q = filter.toLowerCase();

  const matches = allExisting.filter(
    (t) => !already.has(t.name.toLowerCase()) &&
            t.name.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    hideTagSuggestions();
    return;
  }

  dom.tagSuggestions.innerHTML = '';
  matches.forEach((tag) => {
    const item = document.createElement('div');
    item.className = 'tag-suggestion-item';
    item.innerHTML = `
      <span class="tag-suggestion-dot" style="background:${escapeHtml(tag.color)}"></span>
      <span>${escapeHtml(tag.name)}</span>
    `;

    // mousedown fires before blur so the click registers before the dropdown hides
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Reuse the existing tag's color
      dom.connTagColor.value = tag.color;
      dom.connTagInput.value = tag.name;
      addTag();
    });

    dom.tagSuggestions.appendChild(item);
  });

  dom.tagSuggestions.classList.remove('hidden');
}

// ===== Connection Manager =====

function openConnectionManager(profileToEdit = null) {
  dom.connectionModal.classList.remove('hidden');
  resetConnectionForm();
  renderProfilesList();
  if (profileToEdit) {
    selectProfile(profileToEdit);
  }
}

function closeConnectionManager() {
  dom.connectionModal.classList.add('hidden');
}

function resetConnectionForm() {
  state.editingProfileId = null;
  state.sshMode = 'terminal';
  state.scpDirection = 'upload';
  state.authType = 'key';
  state.keyMode = 'file';
  state.currentTags = [];
  dom.connectionForm.reset();
  dom.connPort.value = '';
  dom.connPem.value = '';
  dom.connPemText.value = '';
  dom.connPassword.value = '';
  dom.btnDeleteProfile.classList.add('hidden');

  setAuthType('key');
  setKeyMode('file');

  setSSHMode('terminal');

  document.querySelectorAll('.direction-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.direction === 'upload');
  });
  dom.connSCPDirection.value = 'upload';

  renderFormTags();

  // Clear actions state
  state.currentActions  = [];
  state.editingActionId = null;
  dom.actionEditor.classList.add('hidden');
  renderActionsList();

  updateProtocolSections();

  document.querySelectorAll('.profile-item.selected').forEach((el) => {
    el.classList.remove('selected');
  });
}

function updateProtocolSections() {
  const protocol = dom.connProtocol.value;

  const defaultPorts = { ssh: 22, telnet: 23, ftp: 21 };

  if (!dom.connPort.value) {
    dom.connPort.placeholder = String(defaultPorts[protocol] || '');
  }

  const isSSH = protocol === 'ssh';
  const isSerial = protocol === 'serial';

  // Hide host/port/username rows for serial (they're not applicable)
  const hostRow = dom.connHost?.closest('.form-row') || dom.connHost?.parentElement?.closest('.form-row');
  if (hostRow) hostRow.classList.toggle('hidden', isSerial);

  dom.authSection.classList.toggle('hidden', !isSSH);
  dom.sshModeSection.classList.toggle('hidden', !isSSH);
  dom.sshCommonOptions.classList.toggle('hidden', !isSSH);
  dom.scpTransferSection.classList.toggle('hidden', !(isSSH && state.sshMode === 'scp'));
  // SCP-only option cards
  document.querySelectorAll('.scp-only-option').forEach((el) => {
    el.classList.toggle('hidden', !(isSSH && state.sshMode === 'scp'));
  });
  dom.telnetOptionsSection.classList.toggle('hidden', protocol !== 'telnet');
  dom.ftpOptionsSection.classList.toggle('hidden', protocol !== 'ftp');
  dom.serialOptionsSection.classList.toggle('hidden', !isSerial);

  if (isSerial) {
    populateSerialPorts();
  }
}

function setAuthType(authType) {
  state.authType = authType;
  document.querySelectorAll('.auth-type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.auth === authType);
  });
  dom.authKeySection.classList.toggle('hidden', authType !== 'key');
  dom.authPasswordSection.classList.toggle('hidden', authType !== 'password');
}

function setKeyMode(mode) {
  state.keyMode = mode;
  document.querySelectorAll('.key-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.keymode === mode);
  });
  dom.keyFileSection.classList.toggle('hidden', mode !== 'file');
  dom.keyPasteSection.classList.toggle('hidden', mode !== 'paste');
}

function setSSHMode(mode) {
  state.sshMode = mode;
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  dom.scpTransferSection.classList.toggle('hidden', mode !== 'scp');
  // Show/hide SCP-specific option cards
  document.querySelectorAll('.scp-only-option').forEach((el) => {
    el.classList.toggle('hidden', mode !== 'scp');
  });
}

function setSCPDirection(direction) {
  state.scpDirection = direction;
  dom.connSCPDirection.value = direction;
  document.querySelectorAll('.direction-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.direction === direction);
  });
}

function getFormData() {
  const protocol = dom.connProtocol.value;
  const data = {
    name: dom.connName.value.trim(),
    protocol,
    host: dom.connHost.value.trim(),
    port: dom.connPort.value ? parseInt(dom.connPort.value) : null,
    username: dom.connUsername.value.trim(),
    tags: [...state.currentTags],
  };

  if (protocol === 'ssh') {
    data.sshMode = state.sshMode;
    data.authType = state.authType;
    data.keyMode = state.keyMode;
    data.pemFile = (state.authType === 'key' && state.keyMode === 'file') ? (dom.connPem.value || null) : null;
    data.pemText = (state.authType === 'key' && state.keyMode === 'paste') ? (dom.connPemText.value || null) : null;
    data.password = state.authType === 'password' ? dom.connPassword.value : null;

    data.compression = dom.optCompression.checked;
    data.verbose = dom.optVerbose.checked;
    data.agentForwarding = dom.optAgentForwarding.checked;
    data.x11Forwarding = dom.optX11Forwarding.checked;
    data.strictHostOff = dom.optStrictHostOff.checked;
    data.keepAlive = dom.optKeepAlive.checked;
    data.ipv4 = dom.optIpv4.checked;
    data.ipv6 = dom.optIpv6.checked;
    data.scpRecursive = dom.optScpRecursive.checked;
    data.scpLegacy = dom.optScpLegacy.checked;
    data.extraOptions = dom.connExtraOptions.value.trim();

    if (state.sshMode === 'scp') {
      data.direction = state.scpDirection;
      data.localPath = dom.connSCPLocal.value.trim();
      data.remotePath = dom.connSCPRemote.value.trim();
    }
  } else if (protocol === 'telnet') {
    data.telnetOptions = dom.connTelnetOptions.value.trim();
  } else if (protocol === 'ftp') {
    data.ftpOptions = dom.connFTPOptions.value.trim();
  } else if (protocol === 'serial') {
    data.serialPort = dom.serialPort.value;
    data.baudRate = dom.serialBaud.value;
    data.dataBits = dom.serialDatabits.value;
    data.stopBits = dom.serialStopbits.value;
    data.parity = dom.serialParity.value;
    data.flowControl = dom.serialFlow.value;
  }

  // Actions are protocol-agnostic — include for all connection types
  data.actions = state.currentActions.map(a => ({ ...a }));

  return data;
}

function populateForm(profile) {
  dom.connName.value = profile.name || '';
  dom.connProtocol.value = profile.protocol || 'ssh';
  dom.connHost.value = profile.host || '';
  dom.connPort.value = profile.port || '';
  dom.connUsername.value = profile.username || '';
  dom.connPem.value = profile.pemFile || '';
  dom.connPassword.value = profile.password || '';

  state.currentTags = [...(profile.tags || [])];
  renderFormTags();

  dom.connPemText.value = profile.pemText || '';

  if (profile.protocol === 'ssh') {
    state.authType = profile.authType || 'key';
    setAuthType(state.authType);

    state.keyMode = profile.keyMode || 'file';
    setKeyMode(state.keyMode);

    state.sshMode = profile.sshMode || 'terminal';
    setSSHMode(state.sshMode);

    dom.optCompression.checked = profile.compression || false;
    dom.optVerbose.checked = profile.verbose || false;
    dom.optAgentForwarding.checked = profile.agentForwarding || false;
    dom.optX11Forwarding.checked = profile.x11Forwarding || false;
    dom.optStrictHostOff.checked = profile.strictHostOff || false;
    dom.optKeepAlive.checked = profile.keepAlive || false;
    dom.optIpv4.checked = profile.ipv4 || false;
    dom.optIpv6.checked = profile.ipv6 || false;
    dom.optScpRecursive.checked = profile.scpRecursive || false;
    dom.optScpLegacy.checked = profile.scpLegacy || false;
    dom.connExtraOptions.value = profile.extraOptions || '';

    if (profile.sshMode === 'scp') {
      setSCPDirection(profile.direction || 'upload');
      dom.connSCPLocal.value = profile.localPath || '';
      dom.connSCPRemote.value = profile.remotePath || '';
    }
  }

  dom.connTelnetOptions.value = profile.telnetOptions || '';
  dom.connFTPOptions.value = profile.ftpOptions || '';

  if (profile.protocol === 'serial') {
    dom.serialBaud.value = profile.baudRate || '115200';
    dom.serialDatabits.value = profile.dataBits || '8';
    dom.serialStopbits.value = profile.stopBits || '1';
    dom.serialParity.value = profile.parity || 'none';
    dom.serialFlow.value = profile.flowControl || 'none';
    // Port list will be populated by updateProtocolSections → populateSerialPorts
    // then we select the saved port once the list loads
    window.terminalAPI.listSerialPorts().then((ports) => {
      dom.serialPort.innerHTML = ports.length
        ? ports.map((p) => `<option value="${p.path}"${p.path === profile.serialPort ? ' selected' : ''}>${p.manufacturer ? p.path + ' — ' + p.manufacturer : p.path}</option>`).join('')
        : `<option value="${profile.serialPort || ''}">${profile.serialPort || 'No ports found'}</option>`;
    }).catch(() => {});
  }

  // Load actions for this profile
  state.currentActions = Array.isArray(profile.actions) ? profile.actions.map(a => ({ ...a })) : [];
  state.editingActionId = null;
  dom.actionEditor.classList.add('hidden');
  renderActionsList();

  updateProtocolSections();
}

// ===== Profile Management =====

async function loadProfiles() {
  state.profiles = await window.terminalAPI.loadProfiles();
  renderProfilesList();
  renderSidebarTagFilters();
  renderSidebarHosts();
}

async function saveAllProfiles() {
  await window.terminalAPI.saveProfiles(state.profiles);
  renderSidebarTagFilters();
  renderSidebarHosts();
  // Live-sync: push updated profile data to any open tabs so the context
  // menu reflects new/changed actions immediately without reconnecting.
  state.tabs.forEach(tab => {
    if (!tab.connectionProfile?.id) return;
    const updated = state.profiles.find(p => p.id === tab.connectionProfile.id);
    if (updated) tab.connectionProfile = { ...updated };
  });
}

function renderProfilesList() {
  const filter = dom.filterProtocol.value;
  const searchTerm = (dom.profilesSearchInput.value || '').toLowerCase().trim();

  let profiles = state.profiles;

  if (filter === 'ssh') {
    profiles = profiles.filter((p) => p.protocol === 'ssh');
  } else if (filter !== 'all') {
    profiles = profiles.filter((p) => p.protocol === filter);
  }

  if (searchTerm) {
    profiles = profiles.filter((p) =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.host || '').toLowerCase().includes(searchTerm) ||
      (p.username || '').toLowerCase().includes(searchTerm)
    );
  }

  dom.profilesList.innerHTML = '';

  if (profiles.length === 0) {
    dom.profilesList.innerHTML = `
      <div class="profiles-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"></path>
          <circle cx="7" cy="7" r="1" fill="currentColor"></circle>
        </svg>
        ${searchTerm ? 'No matching hosts' : 'No saved hosts yet'}
      </div>
    `;
    return;
  }

  profiles.forEach((profile) => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    if (state.editingProfileId === profile.id) {
      item.classList.add('selected');
    }
    item.dataset.profileId = profile.id;

    const iconClass = profile.protocol === 'ssh' ? 'ssh' : profile.protocol;
    let modeBadge = '';
    if (profile.protocol === 'ssh' && profile.sshMode && profile.sshMode !== 'terminal') {
      modeBadge = `<span class="profile-mode-badge ${profile.sshMode}">${profile.sshMode.toUpperCase()}</span>`;
    }

    const tagDots = (profile.tags || []).map((t) =>
      `<span class="host-tag-dot" style="background:${escapeHtml(t.color)}" title="${escapeHtml(t.name)}"></span>`
    ).join('');

    item.innerHTML = `
      <div class="profile-icon ${iconClass}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"></path>
          <circle cx="7" cy="7" r="1" fill="currentColor"></circle>
        </svg>
      </div>
      <div class="profile-item-info">
        <span class="profile-name">${escapeHtml(profile.name)}</span>
        <span class="profile-host">${escapeHtml(profile.username ? profile.username + '@' : '')}${escapeHtml(profile.host)}${profile.port ? ':' + profile.port : ''}</span>
      </div>
      <div class="host-tags">${tagDots}</div>
      ${modeBadge}
    `;

    item.addEventListener('click', () => selectProfile(profile));
    item.addEventListener('dblclick', () => {
      selectProfile(profile);
      connectFromForm();
    });

    dom.profilesList.appendChild(item);
  });
}

function selectProfile(profile) {
  state.editingProfileId = profile.id;
  populateForm(profile);
  dom.btnDeleteProfile.classList.remove('hidden');
  renderProfilesList();
}

function saveCurrentProfile() {
  const formData = getFormData();

  const isSerial = formData.protocol === 'serial';
  if (!formData.name || (!isSerial && !formData.host)) {
    alert(isSerial
      ? 'Please fill in at least the label field.'
      : 'Please fill in at least the label and hostname fields.');
    return;
  }
  if (isSerial && !formData.serialPort) {
    alert('Please select a serial port.');
    return;
  }

  if (state.editingProfileId) {
    const index = state.profiles.findIndex((p) => p.id === state.editingProfileId);
    if (index !== -1) {
      state.profiles[index] = { ...formData, id: state.editingProfileId };
    }
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    state.profiles.push({ ...formData, id });
    state.editingProfileId = id;
  }

  saveAllProfiles();
  renderProfilesList();
  dom.btnDeleteProfile.classList.remove('hidden');
}

function deleteCurrentProfile() {
  if (!state.editingProfileId) return;

  const confirmed = confirm('Delete this connection profile?');
  if (!confirmed) return;

  state.profiles = state.profiles.filter((p) => p.id !== state.editingProfileId);
  saveAllProfiles();
  resetConnectionForm();
  renderProfilesList();
}

async function connectFromForm() {
  const formData = getFormData();

  if (formData.protocol === 'serial') {
    if (!formData.serialPort) {
      alert('Please select a serial port.');
      return;
    }
  } else if (!formData.host) {
    alert('Please enter a hostname.');
    return;
  }

  // Capture before closeConnectionManager() resets state
  const isUnsaved = !state.editingProfileId;

  // If pasted key text, save to temp file and use as pemFile
  if (formData.pemText) {
    const tempPath = await window.terminalAPI.saveTempKey(formData.pemText);
    formData.pemFile = tempPath;
  }

  closeConnectionManager();
  removeEmptyState();

  const tabName = formData.name || formData.serialPort || formData.host;

  let tabProtocol = formData.protocol;
  if (formData.protocol === 'ssh' && formData.sshMode) {
    tabProtocol = formData.sshMode === 'terminal' ? 'ssh' : formData.sshMode;
  }

  await createTab({
    protocol: tabProtocol,
    name: tabName,
    host: formData.host,
    connectionProfile: formData,
  });

  // Offer to save if the user connected without saving the profile first
  if (isUnsaved) {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (activeTab?.pane) showSaveConnectionBanner(activeTab.pane, formData);
  }
}

// ===== Save-Connection Banner =====

// ===== Finder "Open in Prateek-Term" handler =====

async function openLocalFolderTab(folderPath) {
  removeEmptyState();
  const name = folderPath.split('/').filter(Boolean).pop() || 'Terminal';
  await createTab({ protocol: 'local', name, cwd: folderPath });
}

function showSaveConnectionBanner(pane, formData) {
  // One banner at a time per pane
  pane.querySelector('.save-connection-banner')?.remove();

  const banner = document.createElement('div');
  banner.className = 'save-connection-banner';
  banner.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    <span>Save this connection?</span>
    <button class="save-banner-btn-save">Save</button>
    <button class="save-banner-btn-dismiss" title="Dismiss">&#x2715;</button>
  `;

  let autoTimer = setTimeout(() => banner.remove(), 12000);

  banner.querySelector('.save-banner-btn-save').addEventListener('click', () => {
    clearTimeout(autoTimer);
    saveConnectionFromBanner(formData, banner);
  });

  banner.querySelector('.save-banner-btn-dismiss').addEventListener('click', () => {
    clearTimeout(autoTimer);
    banner.remove();
  });

  pane.appendChild(banner);
}

function saveConnectionFromBanner(formData, banner) {
  const profile = {
    ...formData,
    name: formData.name || formData.host,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  };

  state.profiles.push(profile);
  saveAllProfiles();
  renderProfilesList();
  renderSidebarHosts();

  // Swap banner content to confirmation
  banner.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>Saved to Hosts</span>
  `;
  banner.classList.add('save-connection-banner--saved');
  setTimeout(() => banner.remove(), 2000);
}

// ===== Actions (per-profile custom commands) =====

function renderActionsList() {
  dom.actionsList.innerHTML = '';
  state.currentActions.forEach(action => {
    const row = document.createElement('div');
    row.className = 'action-item';
    row.innerHTML = `
      <span class="action-item-name" title="${escapeHtml(action.name)}">${escapeHtml(action.name)}</span>
      <button type="button" class="action-item-edit"   data-id="${action.id}" title="Edit action">✎</button>
      <button type="button" class="action-item-delete" data-id="${action.id}" title="Delete action">✕</button>
    `;
    row.querySelector('.action-item-edit').addEventListener('click', () => openActionEditor(action.id));
    row.querySelector('.action-item-delete').addEventListener('click', () => deleteAction(action.id));
    dom.actionsList.appendChild(row);
  });
}

function openActionEditor(id = null) {
  state.editingActionId = id;
  const action = id ? state.currentActions.find(a => a.id === id) : null;
  dom.actionNameInput.value    = action ? action.name   : '';
  dom.actionScriptInput.value  = action ? action.script : '';
  dom.actionEditor.classList.remove('hidden');
  dom.actionNameInput.focus();
}

function saveAction() {
  const name   = dom.actionNameInput.value.trim().slice(0, 20);
  const script = dom.actionScriptInput.value;
  if (!name) { dom.actionNameInput.focus(); return; }

  if (state.editingActionId) {
    const idx = state.currentActions.findIndex(a => a.id === state.editingActionId);
    if (idx !== -1) {
      state.currentActions[idx] = { ...state.currentActions[idx], name, script };
    }
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    state.currentActions.push({ id, name, script });
  }
  state.editingActionId = null;
  dom.actionEditor.classList.add('hidden');
  renderActionsList();
}

function deleteAction(id) {
  // If deleting the action currently being edited, close editor first
  if (state.editingActionId === id) {
    state.editingActionId = null;
    dom.actionEditor.classList.add('hidden');
  }
  state.currentActions = state.currentActions.filter(a => a.id !== id);
  renderActionsList();
}

// ===== Utility =====

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Event Listeners =====

async function populateSerialPorts() {
  const sel = dom.serialPort;
  sel.innerHTML = '<option value="">Scanning…</option>';
  try {
    const ports = await window.terminalAPI.listSerialPorts();
    if (ports.length === 0) {
      sel.innerHTML = '<option value="">No serial ports found</option>';
    } else {
      sel.innerHTML = ports.map((p) => {
        const label = p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path;
        return `<option value="${p.path}">${label}</option>`;
      }).join('');
    }
  } catch {
    sel.innerHTML = '<option value="">Error listing ports</option>';
  }
}

// ── Auto-update banner ────────────────────────────────────────────────────────

let _pendingUpdateUrl = null;

function setupUpdateBanner() {
  window.terminalAPI.onUpdateAvailable(({ version, url, prerelease }) => {
    _pendingUpdateUrl = url;
    dom.updateBannerText.textContent = `Prateek-Term v${version} is available`;
    dom.updateBannerChannel.textContent = prerelease ? 'RC / Pre-release' : 'Stable';
    dom.updateBanner.classList.remove('hidden');
    dom.updateBanner.classList.toggle('prerelease', !!prerelease);
  });

  dom.updateDownloadBtn.addEventListener('click', () => {
    if (_pendingUpdateUrl) window.terminalAPI.openUpdateUrl(_pendingUpdateUrl);
  });

  dom.updateDismissBtn.addEventListener('click', () => {
    dom.updateBanner.classList.add('hidden');
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function setupEventListeners() {
  // New tab
  dom.btnNewTab.addEventListener('click', () => {
    removeEmptyState();
    createTab();
  });

  // Sidebar toggle
  dom.btnToggleSidebar.addEventListener('click', toggleSidebar);

  // Sidebar add button
  dom.btnSidebarAdd.addEventListener('click', openConnectionManager);

  // Sidebar search
  dom.sidebarSearchInput.addEventListener('input', renderSidebarHosts);

  // Help
  document.getElementById('btn-help').addEventListener('click', () => window.terminalAPI.openHelp());

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-modal-close').addEventListener('click', closeSettings);
  document.getElementById('btn-settings-cancel').addEventListener('click', closeSettings);
  document.getElementById('settings-modal').querySelector('.modal-backdrop').addEventListener('click', closeSettings);
  document.getElementById('btn-settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-choose-path').addEventListener('click', chooseProfilesPath);
  document.getElementById('btn-import-ssh').addEventListener('click', importSSHConfig);
  document.getElementById('btn-import-json').addEventListener('click', importJSON);
  document.getElementById('btn-export-ssh').addEventListener('click', exportSSHConfig);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);

  // Debug logging toggle
  const debugToggle = document.getElementById('toggle-debug-logging');
  if (debugToggle) {
    debugToggle.addEventListener('change', () => {
      settingsState.debugLogging = debugToggle.checked;
      const panel = document.getElementById('debug-log-panel');
      if (panel) {
        panel.classList.toggle('hidden', !debugToggle.checked);
        if (debugToggle.checked) loadDebugLog();
      }
    });
  }
  document.getElementById('btn-debug-refresh')?.addEventListener('click', loadDebugLog);
  document.getElementById('btn-debug-copy')?.addEventListener('click', async () => {
    const content = document.getElementById('debug-log-content');
    if (content && content.textContent) {
      await navigator.clipboard.writeText(content.textContent);
      const btn = document.getElementById('btn-debug-copy');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  });
  document.getElementById('btn-debug-show-file')?.addEventListener('click', () => {
    window.terminalAPI.debugOpenLogFolder();
    const btn = document.getElementById('btn-debug-show-file');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Opened in Finder ✓';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });
  document.getElementById('btn-debug-clear')?.addEventListener('click', async () => {
    window.terminalAPI.debugClearLog();
    await loadDebugLog();
  });

  // Connection manager
  dom.btnConnectionManager.addEventListener('click', openConnectionManager);
  dom.modalClose.addEventListener('click', closeConnectionManager);
  dom.connectionModal.querySelector('.modal-backdrop').addEventListener('click', closeConnectionManager);

  // Protocol change
  dom.connProtocol.addEventListener('change', updateProtocolSections);

  // Serial port refresh button
  document.getElementById('btn-refresh-ports').addEventListener('click', populateSerialPorts);

  // Filter profiles
  dom.filterProtocol.addEventListener('change', renderProfilesList);

  // Search profiles
  dom.profilesSearchInput.addEventListener('input', renderProfilesList);

  // New profile button
  dom.btnNewProfile.addEventListener('click', resetConnectionForm);

  // Save profile
  dom.btnSaveProfile.addEventListener('click', saveCurrentProfile);

  // Delete profile
  dom.btnDeleteProfile.addEventListener('click', deleteCurrentProfile);

  // Connect form submit
  dom.connectionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    connectFromForm();
  });

  // Actions
  dom.btnAddAction.addEventListener('click', () => openActionEditor(null));
  dom.btnActionSave.addEventListener('click', saveAction);
  dom.btnActionCancel.addEventListener('click', () => {
    state.editingActionId = null;
    dom.actionEditor.classList.add('hidden');
  });
  dom.btnImportActions.addEventListener('click', importActions);
  dom.btnExportActions.addEventListener('click', exportActions);

  // Tags
  dom.btnAddTag.addEventListener('click', addTag);
  dom.connTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Escape') {
      hideTagSuggestions();
    }
  });
  dom.connTagInput.addEventListener('input', () => {
    const val = dom.connTagInput.value.trim();
    if (val.length > 0) {
      showTagSuggestions(val);
    } else {
      // Show all existing tags when field is empty but focused
      showTagSuggestions('');
    }
  });
  dom.connTagInput.addEventListener('focus', () => {
    showTagSuggestions(dom.connTagInput.value.trim());
  });
  dom.connTagInput.addEventListener('blur', () => {
    // Small delay so mousedown on a suggestion fires first
    setTimeout(hideTagSuggestions, 150);
  });

  // Key mode toggle (file / paste)
  document.querySelectorAll('.key-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setKeyMode(btn.dataset.keymode);
    });
  });

  // Auth type selector
  document.querySelectorAll('.auth-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAuthType(btn.dataset.auth);
    });
  });

  // Password visibility toggle
  dom.btnTogglePassword.addEventListener('click', () => {
    const isPassword = dom.connPassword.type === 'password';
    dom.connPassword.type = isPassword ? 'text' : 'password';
  });

  // SSH Mode selector
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSSHMode(btn.dataset.mode);
    });
  });

  // SCP Direction selector
  document.querySelectorAll('.direction-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSCPDirection(btn.dataset.direction);
    });
  });

  // Browse PEM file
  dom.btnBrowsePem.addEventListener('click', async () => {
    const filePath = await window.terminalAPI.openFileDialog({
      title: 'Select Identity File',
      filters: [
        { name: 'Key Files', extensions: ['pem', 'key', 'pub', 'ppk'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (filePath) {
      dom.connPem.value = filePath;
    }
  });

  // Clear PEM
  dom.btnClearPem.addEventListener('click', () => {
    dom.connPem.value = '';
  });

  // Browse local path (SCP)
  dom.btnBrowseLocal.addEventListener('click', async () => {
    const dirPath = await window.terminalAPI.selectDirectoryDialog({
      title: 'Select Local Path',
    });
    if (dirPath) {
      dom.connSCPLocal.value = dirPath;
    }
  });

  // IPv4/IPv6 mutual exclusion
  dom.optIpv4.addEventListener('change', () => {
    if (dom.optIpv4.checked) dom.optIpv6.checked = false;
  });

  dom.optIpv6.addEventListener('change', () => {
    if (dom.optIpv6.checked) dom.optIpv4.checked = false;
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
      e.preventDefault();
      removeEmptyState();
      createTab();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault();
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openConnectionManager();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }

    if (e.key === 'Escape') {
      closeConnectionManager();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      window.terminalAPI.openHelp();
    }

    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (idx < state.tabs.length) {
        activateTab(state.tabs[idx].id);
      }
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (activeTab) {
      activeTab.fitAddon.fit();
      window.terminalAPI.resizeTerminal(activeTab.ptyId, activeTab.term.cols, activeTab.term.rows);
    }
  });
}

// ===== Settings =====

let settingsState = { profilesPath: '', theme: 'catppuccin-mocha', debugLogging: false };

async function openSettings() {
  const modal = document.getElementById('settings-modal');
  const s = await window.terminalAPI.loadSettings();
  settingsState = { profilesPath: '', theme: 'catppuccin-mocha', debugLogging: false, ...s };
  document.getElementById('settings-profiles-path').value = s.profilesPath || '';
  renderThemePicker(settingsState.theme);

  // Debug toggle
  const toggle = document.getElementById('toggle-debug-logging');
  if (toggle) {
    toggle.checked = !!settingsState.debugLogging;
    const panel = document.getElementById('debug-log-panel');
    if (panel) {
      panel.classList.toggle('hidden', !settingsState.debugLogging);
      if (settingsState.debugLogging) loadDebugLog();
    }
  }

  setSettingsStatus('');
  modal.classList.remove('hidden');
}

function renderThemePicker(selectedId) {
  const grid = document.getElementById('theme-picker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(THEMES).forEach(([id, theme]) => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (id === selectedId ? ' theme-card--active' : '');
    card.dataset.themeId = id;

    const preview = document.createElement('div');
    preview.className = 'theme-card-preview';
    theme.swatch.forEach((color) => {
      const dot = document.createElement('span');
      dot.className = 'theme-swatch-dot';
      dot.style.background = color;
      preview.appendChild(dot);
    });

    const label = document.createElement('span');
    label.className = 'theme-card-label';
    label.textContent = theme.label;

    if (!theme.dark) {
      const badge = document.createElement('span');
      badge.className = 'theme-light-badge';
      badge.textContent = 'Light';
      label.appendChild(badge);
    }

    card.appendChild(preview);
    card.appendChild(label);

    card.addEventListener('click', () => {
      grid.querySelectorAll('.theme-card').forEach(c => c.classList.remove('theme-card--active'));
      card.classList.add('theme-card--active');
      settingsState.theme = id;
      applyTheme(id); // live preview
    });

    grid.appendChild(card);
  });
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function setSettingsStatus(msg, isError = false) {
  const el = document.getElementById('settings-status');
  el.textContent = msg;
  el.className = 'settings-status' + (isError ? ' error' : '');
}

async function chooseProfilesPath() {
  const p = await window.terminalAPI.chooseProfilesPath();
  if (!p) return;
  settingsState.profilesPath = p;
  document.getElementById('settings-profiles-path').value = p;
  setSettingsStatus('Path updated — click Save to apply.');
}

async function saveSettings() {
  await window.terminalAPI.saveSettings(settingsState);
  applyTheme(settingsState.theme);
  setSettingsStatus('Settings saved.');
  await loadProfiles();
  setTimeout(closeSettings, 800);
}

// ===== Debug Log =====

async function loadDebugLog() {
  const contentEl = document.getElementById('debug-log-content');
  const meta = document.getElementById('debug-log-meta');
  const pathEl = document.getElementById('debug-log-path');
  if (!contentEl) return;

  contentEl.textContent = 'Loading…';
  try {
    const result = await window.terminalAPI.debugGetLog();
    // Defensive: content must be a string
    const content = typeof result?.content === 'string' ? result.content : '';
    const size = typeof result?.size === 'number' ? result.size : 0;
    const logPath = result?.path || '';

    if (pathEl) pathEl.textContent = logPath;

    if (!content || content.trim() === '') {
      contentEl.textContent = 'No log entries yet. Enable debug logging and reproduce the issue, then click Refresh.';
      if (meta) meta.textContent = 'Empty';
    } else {
      contentEl.textContent = content;
      contentEl.scrollTop = contentEl.scrollHeight;
      const lines = content.split('\n').filter(Boolean).length;
      const kb = (size / 1024).toFixed(1);
      if (meta) meta.textContent = `${lines} lines · ${kb} KB`;
    }
  } catch (e) {
    contentEl.textContent = 'Error reading log: ' + e.message;
    console.error('[debug panel] loadDebugLog error:', e);
  }
}

async function importSSHConfig() {
  setSettingsStatus('Importing…');
  const imported = await window.terminalAPI.importSSHConfig();
  if (!imported) { setSettingsStatus('Import cancelled.', false); return; }
  if (!imported.length) { setSettingsStatus('No hosts found in that file.', true); return; }

  const existingIds = new Set(state.profiles.map(p => p.id));
  const newProfiles = imported.filter(p => !existingIds.has(p.id));
  state.profiles = [...state.profiles, ...newProfiles];
  await window.terminalAPI.saveProfiles(state.profiles);
  renderProfilesList();
  renderSidebarHosts();
  setSettingsStatus(`Imported ${newProfiles.length} host(s).`);
}

async function importJSON() {
  setSettingsStatus('Importing…');
  const imported = await window.terminalAPI.importJSON();
  if (!imported) { setSettingsStatus('Import cancelled or invalid file.', true); return; }

  const existingIds = new Set(state.profiles.map(p => p.id));
  const newProfiles = imported.filter(p => !existingIds.has(p.id));
  state.profiles = [...state.profiles, ...newProfiles];
  await window.terminalAPI.saveProfiles(state.profiles);
  renderProfilesList();
  renderSidebarHosts();
  setSettingsStatus(`Imported ${newProfiles.length} host(s).`);
}

async function exportSSHConfig() {
  setSettingsStatus('Exporting…');
  const ok = await window.terminalAPI.exportSSHConfig(state.profiles);
  setSettingsStatus(ok ? 'Exported SSH Config.' : 'Export cancelled.', !ok);
}

async function exportJSON() {
  setSettingsStatus('Exporting…');
  const ok = await window.terminalAPI.exportJSON(state.profiles);
  setSettingsStatus(ok ? 'Exported JSON.' : 'Export cancelled.', !ok);
}

// ===== Actions Import / Export =====

async function exportActions() {
  if (!state.currentActions.length) return;
  const ok = await window.terminalAPI.exportActions(state.currentActions);
  if (ok) setSettingsStatus('Actions exported.');
}

async function importActions() {
  const imported = await window.terminalAPI.importActions();
  if (!imported || !imported.length) return;

  const existingNames = new Set(state.currentActions.map(a => a.name.toLowerCase()));
  let added = 0;
  imported.forEach(({ name, script }) => {
    const trimmed = (name || '').trim().slice(0, 20);
    if (!trimmed || existingNames.has(trimmed.toLowerCase())) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    state.currentActions.push({ id, name: trimmed, script: script || '' });
    existingNames.add(trimmed.toLowerCase());
    added++;
  });
  renderActionsList();
  if (added) setSettingsStatus(`${added} action(s) imported.`);
}

// ===== Initialize =====

async function init() {
  try {
    await loadXtermModules();
    setupTerminalListeners();
    setupEventListeners();
    // Apply saved theme before rendering anything
    const savedSettings = await window.terminalAPI.loadSettings();
    state.currentTheme = savedSettings.theme || 'catppuccin-mocha';
    applyTheme(state.currentTheme);
    await loadProfiles();
    showEmptyState();
    window.terminalAPI.onOpenSettings(openSettings);
    window.terminalAPI.onOpenFolder(openLocalFolderTab);
    window.terminalAPI.onAutoConnect((profile) => quickConnect(profile));
    window.terminalAPI.rendererReady();   // flush any buffered open-folder URLs
    setupUpdateBanner();
  } catch (err) {
    console.error('Failed to initialize:', err);
  }
}

// Prevent Electron from navigating to dropped files
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

document.addEventListener('DOMContentLoaded', init);
