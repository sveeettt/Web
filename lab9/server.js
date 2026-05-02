const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupRestApi = require('./rest');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

setupRestApi(app);

// Хранилище для чата
const users = new Map(); // socketId -> { username, role }
const blockedUsers = new Set(); // заблокированные пользователи

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('join', ({ username, role }) => {
        // Проверка на блокировку
        if (blockedUsers.has(username)) {
            socket.emit('userBlocked', { username });
            socket.disconnect();
            return;
        }
        
        socket.data.username = username;
        socket.data.role = role || 'User';
        users.set(socket.id, { username, role: socket.data.role });
        
        // Приветствие
        socket.emit('message', { 
            id: Date.now(),
            user: 'System', 
            text: `Добро пожаловать в поддержку «Взлёт», ${username}!`,
            role: 'system'
        });
        
        // Уведомление остальных
        socket.broadcast.emit('message', { 
            id: Date.now(),
            user: 'System', 
            text: `${username} присоединился к чату`,
            role: 'system'
        });
        
        console.log(`Пользователь ${username} (${role}) присоединился`);
    });
    
    socket.on('sendMessage', (text) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        // Проверка на блокировку
        if (blockedUsers.has(user.username)) {
            socket.emit('userBlocked', { username: user.username });
            socket.disconnect();
            return;
        }
        
        const messageData = {
            id: Date.now(),
            user: user.username,
            role: user.role,
            text: text.trim()
        };
        
        io.emit('message', messageData);
    });
    
    // Удаление сообщения (только для Admin)
    socket.on('deleteMessage', (messageId) => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            console.log(`Администратор ${user.username} удалил сообщение ${messageId}`);
            io.emit('messageDeleted', messageId);
        }
    });
    
    // Блокировка пользователя (только для Admin)
    socket.on('blockUser', (usernameToBlock) => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            blockedUsers.add(usernameToBlock);
            io.emit('userBlocked', { username: usernameToBlock });
            console.log(`Администратор ${user.username} заблокировал ${usernameToBlock}`);
            
            // Отключаем заблокированного пользователя
            for (const [sid, u] of users.entries()) {
                if (u.username === usernameToBlock) {
                    const targetSocket = io.sockets.sockets.get(sid);
                    if (targetSocket) {
                        targetSocket.emit('userBlocked', { username: usernameToBlock });
                        targetSocket.disconnect();
                    }
                }
            }
        }
    });
    
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            io.emit('message', { 
                id: Date.now(),
                user: 'System', 
                text: `${user.username} покинул чат`,
                role: 'system'
            });
            users.delete(socket.id);
            console.log(`Пользователь ${user.username} отключился`);
        }
    });
});

server.listen(port, () => {
    console.log(`Сервер авиакомпании «Взлёт» запущен: http://localhost:${port}`);
    console.log(`Чат доступен по адресу: http://localhost:${port}/chat`);
});