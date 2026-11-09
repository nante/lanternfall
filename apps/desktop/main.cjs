const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1000, minHeight: 700, backgroundColor:'#07080a', title:'Lanternfall', webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true} });
  win.loadFile(path.join(__dirname, '../../dist/client/index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
});
app.on('window-all-closed', () => app.quit());
