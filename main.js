const { app, BrowserWindow, ipcMain } = require('electron');
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

let mainWindow;
let port;

function initializeBillAcceptor(portName = '/dev/ttyUSB0', baudRate = 9600) {
    return new SerialPort(
        portName,
        {
            baudRate: baudRate,
            dataBits: 8,
            parity: 'even',
            stopBits: 1,
            autoOpen: false,
        },
        (err) => {
            if (err) {
                console.error(`Error initializing serial port: ${err.message}`);
                mainWindow.webContents.send('serial-log', `Error initializing: ${err.message}`);
            }
        }
    );
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('index.html');
    mainWindow.webContents.openDevTools();

    // Serial Communication Setup
    port = initializeBillAcceptor();

    port.open((err) => {
        if (err) {
            console.error(`Error opening port: ${err.message}`);
            mainWindow.webContents.send('serial-log', `Error opening port: ${err.message}`);
        } else {
            console.log(`Connected to ${port.path}`);
            mainWindow.webContents.send('serial-log', `Connected to ${port.path}`);
        }
    });

    const parser = port.pipe(new Readline({ delimiter: '\r\n' }));
    parser.on('data', (data) => {
        console.log(`Received response: ${data}`);
        mainWindow.webContents.send('serial-log', `Received: ${data}`);
        processResponse(data);
    });

    ipcMain.on('send-command', (event, command) => {
        sendCommand(command);
    });
}

function sendCommand(command) {
    const commandBuffer = Buffer.from(command, 'hex');
    port.write(commandBuffer, (err) => {
        if (err) {
            console.error(`Error sending command: ${err.message}`);
            mainWindow.webContents.send('serial-log', `Error sending command: ${err.message}`);
        } else {
            console.log(`Command sent: ${command}`);
            mainWindow.webContents.send('serial-log', `Command sent: ${command}`);
        }
    });
}

function processResponse(response) {
    if (response.startsWith('00')) {
        console.log('Idle status received.');
        mainWindow.webContents.send('serial-log', 'Idle status received.');
        return;
    }

    if (response === '808F') {
        console.log('Power-up acknowledgment received.');
        mainWindow.webContents.send('serial-log', 'Power-up acknowledgment received.');
        sendCommand('02'); // Send acknowledgment
    } else if (response.startsWith('81')) {
        const billType = parseInt(response.substr(4, 2), 16);
        const value = getValueFromBillType(billType);
        console.log(`Bill type: ${billType}, Value: ${value}`);
        mainWindow.webContents.send('serial-log', `Bill type: ${billType}, Value: ${value}`);
        sendCommand('02'); // Accept the bill
    } else {
        console.log(`Unknown response: ${response}`);
        mainWindow.webContents.send('serial-log', `Unknown response: ${response}`);
    }
}

function getValueFromBillType(billType) {
    const valueMap = {
        64: '10 nghìn',
        65: '20 nghìn',
        66: '50 nghìn',
        67: '100 nghìn',
        68: '200 nghìn',
        69: '500 nghìn',
    };
    return valueMap[billType] || 'Unknown';
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

