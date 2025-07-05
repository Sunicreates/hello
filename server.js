const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with proper CORS
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Route handler
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.IO logic
const users = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Modify the register handler to calculate positions in a line
  socket.on('register', (username) => {
    // Validate username
    if (!username || username.length < 3 || username.length > 20) {
      socket.emit('registration_failed', 'Username must be 3-20 characters');
      return;
    }
    
    // Check if username is taken
    if (users[username]) {
      socket.emit('registration_failed', 'Username already taken');
      return;
    }
    
    // Calculate position in a line
    const userCount = Object.keys(users).length;
    const spacing = 2; // Distance between avatars
    const startX = -((userCount * spacing) / 2); // Center the line
    
    // Register user with calculated position
    users[username] = {
      id: socket.id,
      animation: 'Chicken Dance.fbx',
      position: { 
        x: startX + (userCount * spacing), 
        y: 0, 
        z: 0 
      }
    };
    
    // Update positions for all existing users to maintain spacing
    Object.keys(users).forEach((uname, index) => {
      users[uname].position = {
        x: startX + (index * spacing) + 3, // shift first user by +1
        y: 0,
        z: 0
      };
   
      // Notify all clients of position updates
      io.emit('avatar_position_update', {
        username: uname,
        position: users[uname].position
      });
    });
    
    socket.username = username;
    
    // Send success response
    socket.emit('registration_success');
    
    // Send world state to new user
    const worldState = {};
    Object.keys(users).forEach(username => {
      if (username !== socket.username) {
        worldState[username] = {
          animation: users[username].animation,
          position: users[username].position
        };
      }
    });
    socket.emit('world_state', worldState);
    
    // Notify all users of the new user list
    updateUserList();
    
    console.log(`User registered: ${username}`);
  });
  
  // Handle animation changes
  socket.on('change_animation', (animationFile) => {
    if (!socket.username || !users[socket.username]) return;
    
    users[socket.username].animation = animationFile;
    
    // Broadcast the animation change to all users
    io.emit('avatar_updated', {
      username: socket.username,
      animation: animationFile
    });
  });
  
  // Handle chat messages
  socket.on('chat_message', (data) => {
    if (!socket.username || !users[socket.username]) return;
    
    // Broadcast the message to all users
    io.emit('chat_message', {
      username: socket.username,
      message: data.message
    });
  });
  
  // Handle position updates
  socket.on('avatar_position', (position) => {
    if (!socket.username || !users[socket.username]) return;
    
    // Update user's position
    users[socket.username].position = position;
    
    // Broadcast to all other users
    socket.broadcast.emit('avatar_position_update', {
      username: socket.username,
      position: position
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.username) {
      // Notify all users about disconnection
      io.emit('user_disconnected', socket.username);
      
      delete users[socket.username];
      updateUserList();
      console.log(`User disconnected: ${socket.username}`);
    }
  });
  
  // Update all clients with current user list
  function updateUserList() {
    io.emit('user_list', Object.keys(users));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});