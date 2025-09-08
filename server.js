const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const UPLOADS_DIR = 'uploads';

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
    console.log(`Uploads directory created at: ${UPLOADS_DIR}`);
}

let devices = {};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8'));
  }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(`/${UPLOADS_DIR}`, express.static(path.join(__dirname, UPLOADS_DIR)));

app.post('/upload', upload.single('file'), (req, res) => {
  const targetDeviceId = req.body.targetDevice;
  const file = req.file;

  if (!file) {
    return res.status(400).send('没有上传文件');
  }

  if (devices[targetDeviceId]) {
    io.to(targetDeviceId).emit('file-notification', {
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileSize: file.size,
      downloadUrl: `/${UPLOADS_DIR}/${file.filename}`
    });
    res.send('文件已发送');
  } else {
    res.status(404).send('目标设备未找到');
  }
});

io.on('connection', (socket) => {
  console.log('一个新设备连接:', socket.id);

  const deviceName = os.hostname();
  devices[socket.id] = {
    id: socket.id,
    name: `${deviceName}-${socket.id.substring(0, 4)}`
  };

  socket.emit('device-info', devices[socket.id]);
  io.emit('update-devices', Object.values(devices));

  socket.on('text-change', (text) => {
    socket.broadcast.emit('text-update', text);
  });

  socket.on('disconnect', () => {
    console.log('设备断开连接:', socket.id);
    delete devices[socket.id];
    io.emit('update-devices', Object.values(devices));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 AirDrop Web 服务已成功启动！`);
  console.log(`\n🔗 请在局域网内的其他设备浏览器中访问以下地址之一:`);
  
  const networkInterfaces = os.networkInterfaces();
  let hasPrintedAddress = false;

  Object.keys(networkInterfaces).forEach(ifaceName => {
    networkInterfaces[ifaceName].forEach(iface => {
      // 只显示 IPv4 且非内部的地址
      if ('IPv4' === iface.family && !iface.internal) {
        console.log(`   - http://${iface.address}:${PORT}`);
        hasPrintedAddress = true;
      }
    });
  });

  if (!hasPrintedAddress) {
      console.log(`   - 未找到可用的局域网地址，请尝试访问 http://localhost:${PORT} 或 http://127.0.0.1:${PORT}`);
  }
  console.log('\n');
});