const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupRestApi = require('./rest');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

setupRestApi(app);

// Хранилище для чата
const users = new Map(); // socketId -> { username, role, room }
const blockedUsers = new Set();
const rooms = new Map(); // roomName -> { isPrivate, invitedUsers, createdBy, messages }
const userSocketMap = new Map(); // username -> socketId

// Инициализация публичной комнаты
rooms.set('general', {
    isPrivate: false,
    invitedUsers: [],
    createdBy: 'system',
    messages: []
});

// Список онлайн пользователей
let onlineUsers = [];

// Вспомогательные функции
function getRoomsList() {
    const list = [];
    for (const [name, data] of rooms.entries()) {
        list.push({
            name: name,
            isPrivate: data.isPrivate,
            invitedUsers: data.invitedUsers,
            createdBy: data.createdBy
        });
    }
    return list;
}

function getAvailableRooms(username, role) {
    const available = [];
    for (const [name, data] of rooms.entries()) {
        if (!data.isPrivate || role === 'Admin' || data.invitedUsers.includes(username)) {
            available.push(name);
        }
    }
    return available;
}

function notifyAdminsRoomsList() {
    for (const [socketId, user] of users.entries()) {
        if (user.role === 'Admin') {
            const adminSocket = io.sockets.sockets.get(socketId);
            if (adminSocket) {
                adminSocket.emit('roomsList', getRoomsList());
            }
        }
    }
}

function notifyAdminsBlockedList() {
    for (const [socketId, user] of users.entries()) {
        if (user.role === 'Admin') {
            const adminSocket = io.sockets.sockets.get(socketId);
            if (adminSocket) {
                adminSocket.emit('blockedUsersList', Array.from(blockedUsers));
            }
        }
    }
}

function notifyAdminsOnlineList() {
    for (const [socketId, user] of users.entries()) {
        if (user.role === 'Admin') {
            const adminSocket = io.sockets.sockets.get(socketId);
            if (adminSocket) {
                adminSocket.emit('onlineUsersList', onlineUsers);
            }
        }
    }
}

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('join', ({ username, role, room }) => {
        // Проверка на блокировку
        if (blockedUsers.has(username)) {
            socket.emit('userBlocked', { username });
            socket.disconnect();
            return;
        }
        
        socket.data.username = username;
        socket.data.role = role || 'User';
        socket.data.room = room || 'general';
        
        users.set(socket.id, { 
            username, 
            role: socket.data.role, 
            room: socket.data.room 
        });
        userSocketMap.set(username, socket.id);
        
        // Обновляем список онлайн пользователей
        if (!onlineUsers.includes(username)) {
            onlineUsers.push(username);
        }
        
        // Присоединяемся к комнате Socket.IO
        socket.join(socket.data.room);
        
        // Проверка доступа к приватной комнате
        const targetRoom = rooms.get(socket.data.room);
        if (targetRoom && targetRoom.isPrivate) {
            if (!targetRoom.invitedUsers.includes(username) && socket.data.role !== 'Admin') {
                socket.emit('accessDenied', { room: socket.data.room });
                socket.emit('message', {
                    id: Date.now(),
                    user: 'System',
                    text: `Доступ к комнате "${socket.data.room}" запрещен. Вы не приглашены.`,
                    role: 'system'
                });
                // Перемещаем в general
                socket.leave(socket.data.room);
                socket.data.room = 'general';
                socket.join('general');
                return;
            }
        }
        
        // Отправляем историю сообщений комнаты
        const roomData = rooms.get(socket.data.room);
        const history = roomData ? roomData.messages : [];
        history.forEach(msg => {
        if (!msg.room) msg.room = socket.data.room; // Добавляем комнату, если её нет
        socket.emit('message', msg);
    });
        
        // Приветствие
        const welcomeMsg = {
            id: Date.now(),
            user: 'System',
            text: `Добро пожаловать в чат «Взлёт», ${username}! Комната: ${socket.data.room}`,
            role: 'system'
        };
        socket.emit('message', welcomeMsg);
        if (roomData) {
            roomData.messages.push(welcomeMsg);
        }
        
        // Уведомление остальных в комнате
        const joinMsg = {
            id: Date.now(),
            user: 'System',
            text: `${username} присоединился к чату`,
            role: 'system'
        };
        socket.to(socket.data.room).emit('message', joinMsg);
        if (roomData) {
            roomData.messages.push(joinMsg);
        }
        
        // Отправляем списки админу
        if (socket.data.role === 'Admin') {
            socket.emit('roomsList', getRoomsList());
            socket.emit('onlineUsersList', onlineUsers);
            socket.emit('blockedUsersList', Array.from(blockedUsers));
        }
        
        // Отправляем пользователю список доступных комнат
        const availableRooms = getAvailableRooms(username, socket.data.role);
        socket.emit('availableRooms', availableRooms);
        
        console.log(`Пользователь ${username} (${role}) присоединился к комнате ${socket.data.room}`);
    });
    
    socket.on('sendMessage', (data) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        if (blockedUsers.has(user.username)) {
            socket.emit('userBlocked', { username: user.username });
            socket.disconnect();
            return;
        }
        
        const messageData = {
            id: Date.now(),
            user: user.username,
            role: user.role,
            text: data.text.trim(),
            room: user.room
        };
        
        // Сохраняем в истории комнаты
        const roomData = rooms.get(user.room);
        if (roomData) {
            roomData.messages.push(messageData);
            // Ограничиваем историю 100 сообщениями
            if (roomData.messages.length > 100) {
                roomData.messages.shift();
            }
        }
        
        // Отправляем всем в комнате
        io.to(user.room).emit('message', messageData);
    });
    
    socket.on('deleteMessage', (messageId) => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            console.log(`Администратор ${user.username} удалил сообщение ${messageId}`);
            io.to(user.room).emit('messageDeleted', messageId);
            
            // Удаляем из истории
            const roomData = rooms.get(user.room);
            if (roomData) {
                const index = roomData.messages.findIndex(m => m.id === messageId);
                if (index !== -1) {
                    roomData.messages.splice(index, 1);
                }
            }
        }
    });
    
    // Создание закрытой комнаты (только админ)
    socket.on('createPrivateRoom', ({ roomName, invitedUsers }) => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            if (!rooms.has(roomName)) {
                rooms.set(roomName, {
                    isPrivate: true,
                    invitedUsers: invitedUsers || [],
                    createdBy: user.username,
                    messages: []
                });
                
                // Уведомляем всех админов об обновлении списка комнат
                notifyAdminsRoomsList();
                
                // Приглашаем пользователей
                if (invitedUsers && invitedUsers.length > 0) {
                    invitedUsers.forEach(invitedUsername => {
                        const invitedSocketId = userSocketMap.get(invitedUsername);
                        if (invitedSocketId) {
                            const invitedSocket = io.sockets.sockets.get(invitedSocketId);
                            if (invitedSocket) {
                                invitedSocket.emit('invitation', {
                                    room: roomName,
                                    invitedBy: user.username
                                });
                                // Обновляем список доступных комнат для приглашенного
                                const available = getAvailableRooms(invitedUsername, 'User');
                                invitedSocket.emit('availableRooms', available);
                            }
                        }
                    });
                }
                
                socket.emit('roomCreated', { roomName, invitedUsers });
                console.log(`Администратор ${user.username} создал закрытую комнату ${roomName}`);
            } else {
                socket.emit('error', { message: 'Комната с таким именем уже существует' });
            }
        }
    });
    
    // Получить список комнат (для админа)
    socket.on('getRoomsList', () => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            socket.emit('roomsList', getRoomsList());
        }
    });
    
    // Приглашение пользователя в комнату (только админ)
    socket.on('inviteToRoom', ({ username, roomName }) => {
        const admin = users.get(socket.id);
        if (admin && admin.role === 'Admin') {
            const room = rooms.get(roomName);
            if (room && room.isPrivate) {
                if (!room.invitedUsers.includes(username)) {
                    room.invitedUsers.push(username);
                    
                    // Отправляем приглашение пользователю
                    const invitedSocketId = userSocketMap.get(username);
                    if (invitedSocketId) {
                        const invitedSocket = io.sockets.sockets.get(invitedSocketId);
                        if (invitedSocket) {
                            invitedSocket.emit('invitation', {
                                room: roomName,
                                invitedBy: admin.username
                            });
                            // Обновляем список доступных комнат
                            const available = getAvailableRooms(username, 'User');
                            invitedSocket.emit('availableRooms', available);
                        }
                    }
                    
                    socket.emit('userInvited', { username, roomName });
                    console.log(`Администратор ${admin.username} пригласил ${username} в комнату ${roomName}`);
                } else {
                    socket.emit('error', { message: 'Пользователь уже приглашен' });
                }
            }
        }
    });
    
    // Принятие приглашения пользователем
    socket.on('acceptInvitation', ({ roomName }) => {
        const user = users.get(socket.id);
        if (user) {
            const room = rooms.get(roomName);
            if (room && room.isPrivate && room.invitedUsers.includes(user.username)) {
                // Покидаем старую комнату
                socket.leave(user.room);
                
                // Обновляем комнату пользователя
                user.room = roomName;
                users.set(socket.id, user);
                
                // Присоединяемся к новой комнате
                socket.join(roomName);
                
                // Отправляем историю новой комнаты
                const history = room.messages || [];
                socket.emit('clearMessages');
                history.forEach(msg => {
                    socket.emit('message', msg);
                });
                
                // Уведомление
                socket.emit('roomChanged', { room: roomName });
                
                // Уведомляем всех в комнате
                const joinMsg = {
                    id: Date.now(),
                    user: 'System',
                    text: `${user.username} присоединился к комнате по приглашению`,
                    role: 'system'
                };
                io.to(roomName).emit('message', joinMsg);
                room.messages.push(joinMsg);
                
                console.log(`Пользователь ${user.username} принял приглашение в комнату ${roomName}`);
            }
        }
    });
    
    // Блокировка пользователя (только админ)
    socket.on('blockUser', (usernameToBlock) => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            if (usernameToBlock !== user.username) {
                blockedUsers.add(usernameToBlock);
                io.emit('userBlocked', { username: usernameToBlock });
                console.log(`Администратор ${user.username} заблокировал ${usernameToBlock}`);
                
                // Отключаем заблокированного пользователя
                const blockedSocketId = userSocketMap.get(usernameToBlock);
                if (blockedSocketId) {
                    const targetSocket = io.sockets.sockets.get(blockedSocketId);
                    if (targetSocket) {
                        targetSocket.emit('userBlocked', { username: usernameToBlock });
                        targetSocket.disconnect();
                    }
                }
                
                // Обновляем список у админов
                notifyAdminsBlockedList();
            } else {
                socket.emit('error', { message: 'Нельзя заблокировать самого себя' });
            }
        }
    });
    
    // Пользователь присоединяется к комнате (по выбору)
    socket.on('joinRoom', (roomName) => {
        const user = users.get(socket.id);
        if (user) {
            const room = rooms.get(roomName);
            if (!room) {
                socket.emit('error', { message: 'Комната не существует' });
                return;
            }
            
            if (room.isPrivate && !room.invitedUsers.includes(user.username) && user.role !== 'Admin') {
                socket.emit('error', { message: 'У вас нет доступа к этой комнате' });
                return;
            }
            
            // Покидаем старую комнату
            socket.leave(user.room);
            
            // Обновляем комнату
            user.room = roomName;
            users.set(socket.id, user);
            
            // Присоединяемся к новой
            socket.join(roomName);
            
            // Отправляем историю
            socket.emit('clearMessages');
            room.messages.forEach(msg => {
                socket.emit('message', msg);
            });
            
            socket.emit('roomChanged', { room: roomName });
            console.log(`Пользователь ${user.username} перешел в комнату ${roomName}`);
        }
    });
    
    socket.on('getOnlineUsers', () => {
        const user = users.get(socket.id);
        if (user && user.role === 'Admin') {
            socket.emit('onlineUsersList', onlineUsers);
        }
    });
    
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            // Удаляем из онлайн списка
            const index = onlineUsers.indexOf(user.username);
            if (index !== -1) {
                onlineUsers.splice(index, 1);
            }
            
            const leaveMsg = {
                id: Date.now(),
                user: 'System',
                text: `${user.username} покинул чат`,
                role: 'system'
            };
            io.to(user.room).emit('message', leaveMsg);
            const roomData = rooms.get(user.room);
            if (roomData) {
                roomData.messages.push(leaveMsg);
            }
            users.delete(socket.id);
            userSocketMap.delete(user.username);
            console.log(`Пользователь ${user.username} отключился`);
            
            // Обновляем список онлайн у админов
            notifyAdminsOnlineList();
        }
    });
});

server.listen(port, () => {
    console.log(`Сервер авиакомпании «Взлёт» запущен: http://localhost:${port}`);
    console.log(`Чат доступен по адресу: http://localhost:${port}/chat`);
});