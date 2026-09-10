import net from 'node:net'

const socket = net.createConnection({ host: '127.0.0.1', port: 6379 })

socket.on('data', (buf) => console.log('收到:', JSON.stringify(buf.toString())))
socket.on('connect', () => {
  // 发送 "SET name aura"
  socket.write('*3\r\n$3\r\nSET\r\n$4\r\nname\r\n$4\r\naura\r\n')
  // 发送 "GET name"
  socket.write('*2\r\n$3\r\nGET\r\n$4\r\nname\r\n')
  // 发送 "DEL name"
  socket.write('*2\r\n$3\r\nDEL\r\n$4\r\nname\r\n')
})
