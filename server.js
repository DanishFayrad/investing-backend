const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');


// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposits');

app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);

// Removed local uploads static folder



// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trading_app')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Start Server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
