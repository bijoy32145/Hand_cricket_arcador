const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Game state management
  const rooms = new Map();

  function createRoom(roomId) {
    return {
      id: roomId,
      players: [],
      gameState: {
        phase: 'waiting', // waiting, toss, batting, result
        tossWinner: null,
        currentBatsman: null,
        currentBowler: null,
        innings: 1,
        target: null,
        player1Stats: { score: 0, wickets: 0, overs: 0, balls: 0 },
        player2Stats: { score: 0, wickets: 0, overs: 0, balls: 0 },
        choices: { batsman: null, bowler: null },
        waitingFor: null,
        lastResult: ''
      }
    };
  }

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, playerName) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, createRoom(roomId));
      }

      const room = rooms.get(roomId);
      
      if (room.players.length < 2) {
        const player = {
          id: socket.id,
          name: playerName,
          number: room.players.length + 1
        };
        
        room.players.push(player);
        socket.join(roomId);
        socket.playerNumber = player.number;
        socket.roomId = roomId;

        io.to(roomId).emit('room-update', {
          players: room.players,
          gameState: room.gameState
        });

        if (room.players.length === 2) {
          room.gameState.phase = 'toss';
          io.to(roomId).emit('game-start', room.gameState);
        }
      } else {
        socket.emit('room-full');
      }
    });

    socket.on('toss-choice', (choice) => {
      const room = rooms.get(socket.roomId);
      if (!room || room.gameState.phase !== 'toss') return;

      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const winner = choice === result ? socket.playerNumber : (socket.playerNumber === 1 ? 2 : 1);
      
      room.gameState.tossWinner = winner;
      room.gameState.currentBatsman = winner;
      room.gameState.currentBowler = winner === 1 ? 2 : 1;
      room.gameState.phase = 'batting';
      room.gameState.waitingFor = 'batsman';

      io.to(socket.roomId).emit('toss-result', {
        choice,
        result,
        winner,
        gameState: room.gameState
      });
    });

    socket.on('player-choice', (choice) => {
      const room = rooms.get(socket.roomId);
      if (!room || room.gameState.phase !== 'batting') return;

      const isBatsman = socket.playerNumber === room.gameState.currentBatsman;
      const isBowler = socket.playerNumber === room.gameState.currentBowler;

      if (isBatsman && room.gameState.waitingFor === 'batsman') {
        room.gameState.choices.batsman = choice;
        room.gameState.waitingFor = 'bowler';
        io.to(socket.roomId).emit('choice-made', {
          player: socket.playerNumber,
          type: 'batsman',
          gameState: room.gameState
        });
      } else if (isBowler && room.gameState.waitingFor === 'bowler') {
        room.gameState.choices.bowler = choice;
        room.gameState.waitingFor = null;
        
        // Process the result
        processGameChoice(room);
        io.to(socket.roomId).emit('ball-result', room.gameState);
      }
    });

    socket.on('reset-game', () => {
      const room = rooms.get(socket.roomId);
      if (!room) return;

      room.gameState = {
        phase: 'toss',
        tossWinner: null,
        currentBatsman: null,
        currentBowler: null,
        innings: 1,
        target: null,
        player1Stats: { score: 0, wickets: 0, overs: 0, balls: 0 },
        player2Stats: { score: 0, wickets: 0, overs: 0, balls: 0 },
        choices: { batsman: null, bowler: null },
        waitingFor: null,
        lastResult: ''
      };

      io.to(socket.roomId).emit('game-reset', room.gameState);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      if (socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (room) {
          room.players = room.players.filter(p => p.id !== socket.id);
          
          if (room.players.length === 0) {
            rooms.delete(socket.roomId);
          } else {
            io.to(socket.roomId).emit('player-disconnected', {
              players: room.players,
              gameState: room.gameState
            });
          }
        }
      }
    });
  });

  function processGameChoice(room) {
    const { batsman: batsmanChoice, bowler: bowlerChoice } = room.gameState.choices;
    const currentBatsmanStats = room.gameState.currentBatsman === 1 ? 
      room.gameState.player1Stats : room.gameState.player2Stats;

    if (batsmanChoice === bowlerChoice) {
      // Out!
      const newWickets = currentBatsmanStats.wickets + 1;
      const newBalls = currentBatsmanStats.balls + 1;
      const newOvers = Math.floor(newBalls / 6);
      
      room.gameState.lastResult = `OUT! Both chose ${batsmanChoice}`;
      
      if (room.gameState.currentBatsman === 1) {
        room.gameState.player1Stats = { ...currentBatsmanStats, wickets: newWickets, balls: newBalls, overs: newOvers };
      } else {
        room.gameState.player2Stats = { ...currentBatsmanStats, wickets: newWickets, balls: newBalls, overs: newOvers };
      }
      
      if (newWickets >= 2 || newOvers >= 2) {
        endInnings(room);
      } else {
        resetForNextBall(room);
      }
    } else {
      // Runs scored
      const newScore = currentBatsmanStats.score + batsmanChoice;
      const newBalls = currentBatsmanStats.balls + 1;
      const newOvers = Math.floor(newBalls / 6);
      
      room.gameState.lastResult = `${batsmanChoice} runs scored!`;
      
      if (room.gameState.currentBatsman === 1) {
        room.gameState.player1Stats = { ...currentBatsmanStats, score: newScore, balls: newBalls, overs: newOvers };
      } else {
        room.gameState.player2Stats = { ...currentBatsmanStats, score: newScore, balls: newBalls, overs: newOvers };
      }
      
      if (room.gameState.innings === 2 && room.gameState.target && newScore >= room.gameState.target) {
        room.gameState.phase = 'result';
        return;
      }
      
      if (newOvers >= 2) {
        endInnings(room);
      } else {
        resetForNextBall(room);
      }
    }
  }

  function endInnings(room) {
    if (room.gameState.innings === 1) {
      const firstInningsScore = room.gameState.currentBatsman === 1 ? 
        room.gameState.player1Stats.score : room.gameState.player2Stats.score;
      
      room.gameState.target = firstInningsScore + 1;
      room.gameState.innings = 2;
      room.gameState.currentBatsman = room.gameState.currentBatsman === 1 ? 2 : 1;
      room.gameState.currentBowler = room.gameState.currentBowler === 1 ? 2 : 1;
      room.gameState.lastResult = `End of Innings 1. Target: ${room.gameState.target}`;
      resetForNextBall(room);
    } else {
      room.gameState.phase = 'result';
    }
  }

  function resetForNextBall(room) {
    room.gameState.choices = { batsman: null, bowler: null };
    room.gameState.waitingFor = 'batsman';
  }

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});