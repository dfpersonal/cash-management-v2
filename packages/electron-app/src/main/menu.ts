import { Menu, shell, app, BrowserWindow } from 'electron';

const isMac = process.platform === 'darwin';

export function createApplicationMenu(): Menu {
  const template: any[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Generate Report',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('generate-report');
            }
          }
        },
        {
          label: 'Refresh Data',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('refresh-data');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('open-preferences');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'FRN Management',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-to', '/frn-management');
            }
          }
        },
        { type: 'separator' },
        ...(isMac ? [] : [
          { role: 'quit' }
        ])
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-to', '/dashboard');
            }
          }
        },
        {
          label: 'Holdings',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-to', '/holdings');
            }
          }
        },
        {
          label: 'Optimization',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-to', '/optimization');
            }
          }
        },
        {
          label: 'Risk Assessment',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-to', '/risk');
            }
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [])
      ]
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'User Manual',
          click: async () => {
            await shell.openExternal('https://github.com/your-repo/cash-management/docs/user-manual');
          }
        },
        {
          label: 'Technical Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/your-repo/cash-management/docs/technical');
          }
        },
        { type: 'separator' },
        {
          label: 'About Cash Management',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('show-about');
            }
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}