"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { socketService } from '@/lib/socket';
import { Socket } from 'socket.io-client';
import { Users, Wifi, WifiOff, Trophy, Target, Clock, Bot, UserCheck, ArrowLeft } from 'lucide-react';
import ably from '@/lib/ably';

type GameMode = 'menu' | 'single' | 'multiplayer';
type GamePhase = 'setup' | 'waiting' | 'toss' | 'batting' | 'result';

interface PlayerStats {
  score: number;
  wickets: number;
  overs: number;
  balls: number;
}

interface Player {
  id: string;
  name: string;
  number: number;
}

interface GameState {
  phase: GamePhase;
  tossWinner: number | null;
  currentBatsman: number | null;
  currentBowler: number | null;
  innings: 1 | 2;
  target: number | null;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  choices: { batsman: number | null; bowler: number | null };
  waitingFor: 'batsman' | 'bowler' | null;
  lastResult: string;
}

export default function HandCricketGame() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  
  // Single Player State
  const [singlePlayerGame, setSinglePlayerGame] = useState<GameState>({
    phase: 'setup',
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
  });
  const [playerName, setPlayerName] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  
  // Multiplayer State
  const [gameState, setGameState] = useState<GameState>({
    phase: 'setup',
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
  });
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomId, setRoomId] = useState('');
  const [myPlayerNumber, setMyPlayerNumber] = useState<number | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [tossResult, setTossResult] = useState<{ choice: string; result: string; winner: number } | null>(null);

  // Socket setup for multiplayer
 
  useEffect(() => {
    if (gameMode === 'multiplayer') {
      console.log('Connecting to Ably multiplayer game...');
      const channel = ably.channels.get('game-room');

      // Room Update
      channel.subscribe('room-update', (message) => {
        const data = message.data;
        setPlayers(data.players);
        setGameState(data.gameState);

        const myPlayer = data.players.find((p: any) => p.id === ably.connection.id);
        if (myPlayer) {
          setMyPlayerNumber(myPlayer.number);
        }
      });

      // Game Start
      channel.subscribe('game-start', (message) => {
        setGameState(message.data);
      });

      // Toss Result
      channel.subscribe('toss-result', (message) => {
        setIsFlipping(true);
        setTossResult(message.data);
        setTimeout(() => {
          setIsFlipping(false);
          setGameState(message.data.gameState);
        }, 2000);
      });

      // Player Choice
      channel.subscribe('choice-made', (message) => {
        setGameState(message.data.gameState);
      });

      // Ball Result
      channel.subscribe('ball-result', (message) => {
        setGameState(message.data);
      });

      // Game Reset
      channel.subscribe('game-reset', (message) => {
        setGameState(message.data);
        setTossResult(null);
      });

      // Room Full
      channel.subscribe('room-full', () => {
        alert('Room is full!');
      });

      // Player Disconnected
      channel.subscribe('player-disconnected', (message) => {
        setPlayers(message.data.players);
        setGameState(message.data.gameState);
      });

      // Handle connection status
      const handleConnectionStatus = () => {
        console.log('Ably connection state:', ably.connection.state);
        if (ably.connection.state === 'connected') {
          console.log('Already connected to Ably with ID:', ably.connection.id);
          setConnected(true);
        } else {
          ably.connection.once('connected', () => {
            console.log('Ably connected (via event)');
            setConnected(true);
            console.log('Connected to Ably with ID:', ably.connection.id);
          });
        }
      };

      handleConnectionStatus();

      ably.connection.on('disconnected', () => {
        console.log('Ably disconnected');
        setConnected(false);
      });

      ably.connection.on((stateChange) => {
        console.log('Ably connection state changed:', stateChange);
      });

      return () => {
        channel.unsubscribe();
        console.log('Unsubscribed from game-room');
        ably.close(); // Optional: close connection on component unmount
      };
    }
  }, [gameMode]);
  

  // Single Player AI Logic
  const getAIChoice = () => {
    return Math.floor(Math.random() * 6) + 1;
  };

  const processSinglePlayerChoice = (playerChoice: number, game: GameState) => {
    const aiChoice = getAIChoice();
    const isBatsman = myPlayerNumber === game.currentBatsman;
    
    const batsmanChoice = isBatsman ? playerChoice : aiChoice;
    const bowlerChoice = isBatsman ? aiChoice : playerChoice;
    
    const currentBatsmanStats = game.currentBatsman === 1 ? game.player1Stats : game.player2Stats;
    
    let newGame = { ...game };
    
    if (batsmanChoice === bowlerChoice) {
      // Out!
      const newWickets = currentBatsmanStats.wickets + 1;
      const newBalls = currentBatsmanStats.balls + 1;
      const newOvers = Math.floor(newBalls / 6);
      
      newGame.lastResult = `OUT! Both chose ${batsmanChoice}`;
      
      if (game.currentBatsman === 1) {
        newGame.player1Stats = { ...currentBatsmanStats, wickets: newWickets, balls: newBalls, overs: newOvers };
      } else {
        newGame.player2Stats = { ...currentBatsmanStats, wickets: newWickets, balls: newBalls, overs: newOvers };
      }
      
      if (newWickets >= 2 || newOvers >= 2) {
        newGame = endSinglePlayerInnings(newGame);
      }
    } else {
      // Runs scored
      const newScore = currentBatsmanStats.score + batsmanChoice;
      const newBalls = currentBatsmanStats.balls + 1;
      const newOvers = Math.floor(newBalls / 6);
      
      newGame.lastResult = `${batsmanChoice} runs scored! (You: ${playerChoice}, AI: ${aiChoice})`;
      
      if (game.currentBatsman === 1) {
        newGame.player1Stats = { ...currentBatsmanStats, score: newScore, balls: newBalls, overs: newOvers };
      } else {
        newGame.player2Stats = { ...currentBatsmanStats, score: newScore, balls: newBalls, overs: newOvers };
      }
      
      if (game.innings === 2 && game.target && newScore >= game.target) {
        newGame.phase = 'result';
        return newGame;
      }
      
      if (newOvers >= 2) {
        newGame = endSinglePlayerInnings(newGame);
      }
    }
    
    return newGame;
  };

  const endSinglePlayerInnings = (game: GameState) => {
    if (game.innings === 1) {
      const firstInningsScore = game.currentBatsman === 1 ? game.player1Stats.score : game.player2Stats.score;
      
      return {
        ...game,
        target: firstInningsScore + 1,
        innings: 2 as 1 | 2,
        currentBatsman: game.currentBatsman === 1 ? 2 : 1,
        currentBowler: game.currentBowler === 1 ? 2 : 1,
        lastResult: `End of Innings 1. Target: ${firstInningsScore + 1}`
      };
    } else {
      return { ...game, phase: 'result' as GamePhase };
    }
  };

  // Single Player Functions
  const startSinglePlayer = () => {
    if (!playerName) return;
    
    const tossWinner = Math.random() < 0.5 ? 1 : 2;
    setMyPlayerNumber(1); // Player is always player 1
    
    setSinglePlayerGame({
      ...singlePlayerGame,
      phase: 'batting',
      tossWinner,
      currentBatsman: tossWinner,
      currentBowler: tossWinner === 1 ? 2 : 1,
      lastResult: `Toss: ${tossWinner === 1 ? 'You' : 'AI'} won and will bat first`
    });
  };

  const handleSinglePlayerChoice = (choice: number) => {
    setAiThinking(true);
    
    setTimeout(() => {
      const newGame = processSinglePlayerChoice(choice, singlePlayerGame);
      setSinglePlayerGame(newGame);
      setAiThinking(false);
    }, 1000);
  };

  const resetSinglePlayer = () => {
    setSinglePlayerGame({
      phase: 'setup',
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
    });
  };

  // Multiplayer Functions using Ably

  const channel = ably.channels.get('game-room');


const joinRoom = () => {
  if (playerName && roomId) {
    channel.publish('join-room', { roomId, playerName });
  }
};

const handleToss = (choice: 'heads' | 'tails') => {
  channel.publish('toss-choice', { choice });
};

const handlePlayerChoice = (choice: number) => {
  channel.publish('player-choice', { choice });
};

const resetGame = () => {
  channel.publish('reset-game', {});
};


  // Helper Functions
  const getWinner = (game: GameState) => {
    if (gameMode === 'single') {
      if (game.player1Stats.score > game.player2Stats.score) return 'You';
      if (game.player2Stats.score > game.player1Stats.score) return 'AI';
      return 'Tie';
    } else {
      if (game.player1Stats.score > game.player2Stats.score) return 'Player 1';
      if (game.player2Stats.score > game.player1Stats.score) return 'Player 2';
      return 'Tie';
    }
  };

  const isMyTurn = () => {
    if (gameMode === 'single') {
      return !aiThinking;
    }
    if (gameState.waitingFor === 'batsman' && myPlayerNumber === gameState.currentBatsman) return true;
    if (gameState.waitingFor === 'bowler' && myPlayerNumber === gameState.currentBowler) return true;
    return false;
  };

  const getMyRole = () => {
    const currentGame = gameMode === 'single' ? singlePlayerGame : gameState;
    if (myPlayerNumber === currentGame.currentBatsman) return 'batting';
    if (myPlayerNumber === currentGame.currentBowler) return 'bowling';
    return 'spectating';
  };

  const digitButtons = [1, 2, 3, 4, 5, 6];

  // Game Mode Selection
  if (gameMode === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
          <CardHeader className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
            <CardTitle className="text-3xl font-bold mb-2">🏏 Hand Cricket</CardTitle>
            <p className="text-blue-100">Choose your game mode</p>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Button 
              onClick={() => setGameMode('single')}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-lg py-6 flex items-center justify-center gap-3"
            >
              <Bot className="w-6 h-6" />
              <div className="text-left">
                <div className="font-bold">Single Player</div>
                <div className="text-sm opacity-90">Play vs AI</div>
              </div>
            </Button>
            
            <Button 
              onClick={() => setGameMode('multiplayer')}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg py-6 flex items-center justify-center gap-3"
            >
              <Users className="w-6 h-6" />
              <div className="text-left">
                <div className="font-bold">Multiplayer</div>
                <div className="text-sm opacity-90">Play with friends</div>
              </div>
            </Button>
            
            <div className="text-xs text-gray-500 text-center mt-4">
              Choose single player to practice or multiplayer to challenge friends!
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Single Player Mode
  if (gameMode === 'single') {
    const currentGame = singlePlayerGame;
    
    // Single Player Setup
    if (currentGame.phase === 'setup') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-t-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={() => setGameMode('menu')} />
                <Bot className="w-6 h-6" />
                <CardTitle className="text-2xl font-bold">Single Player Mode</CardTitle>
              </div>
              <p className="text-green-100">Play against AI</p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Your Name</label>
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="border-2 border-gray-200 focus:border-blue-500"
                />
              </div>
              <Button 
                onClick={startSinglePlayer} 
                disabled={!playerName}
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-lg py-3"
              >
                Start Game vs AI
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Single Player Result
    if (currentGame.phase === 'result') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-orange-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-green-600 to-yellow-600 text-white rounded-t-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-6 h-6" />
                <CardTitle className="text-2xl font-bold">Game Result</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-6">
              <div className="text-6xl">
                {getWinner(currentGame) === 'You' ? '🏆' : getWinner(currentGame) === 'AI' ? '🤖' : '🤝'}
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-green-600">
                  {getWinner(currentGame) === 'Tie' ? "It's a Tie!" : `${getWinner(currentGame)} Wins!`}
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">You:</span>
                    <span className="text-lg font-mono">{currentGame.player1Stats.score}/{currentGame.player1Stats.wickets}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">AI:</span>
                    <span className="text-lg font-mono">{currentGame.player2Stats.score}/{currentGame.player2Stats.wickets}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Button onClick={resetSinglePlayer} className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-lg py-3">
                  Play Again
                </Button>
                <Button onClick={() => setGameMode('menu')} variant="outline" className="w-full">
                  Back to Menu
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Single Player Game Interface
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button 
            onClick={() => setGameMode('menu')} 
            variant="outline" 
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>

          {/* Scoreboard */}
          <Card className="bg-gradient-to-r from-gray-900 to-black text-green-400 shadow-2xl border-0">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Bot className="w-6 h-6" />
                <CardTitle className="text-2xl font-mono">YOU vs AI</CardTitle>
              </div>
              <Badge variant="secondary" className="bg-green-600 text-white">
                Innings {currentGame.innings} of 2
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg transition-all ${currentGame.currentBatsman === 1 ? 'bg-green-900 ring-2 ring-green-400' : 'bg-gray-800'}`}>
                  <h3 className="text-lg font-bold text-center">
                    You
                    {currentGame.currentBatsman === 1 && <span className="ml-2 text-yellow-400">🏏</span>}
                  </h3>
                  <div className="text-center font-mono text-3xl">
                    {currentGame.player1Stats.score}/{currentGame.player1Stats.wickets}
                  </div>
                  <div className="text-center text-sm">
                    {currentGame.player1Stats.overs}.{currentGame.player1Stats.balls % 6} overs
                  </div>
                </div>
                <div className={`p-4 rounded-lg transition-all ${currentGame.currentBatsman === 2 ? 'bg-green-900 ring-2 ring-green-400' : 'bg-gray-800'}`}>
                  <h3 className="text-lg font-bold text-center">
                    AI
                    {currentGame.currentBatsman === 2 && <span className="ml-2 text-yellow-400">🏏</span>}
                  </h3>
                  <div className="text-center font-mono text-3xl">
                    {currentGame.player2Stats.score}/{currentGame.player2Stats.wickets}
                  </div>
                  <div className="text-center text-sm">
                    {currentGame.player2Stats.overs}.{currentGame.player2Stats.balls % 6} overs
                  </div>
                </div>
              </div>
              
              {currentGame.target && (
                <div className="text-center bg-blue-900 p-3 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Target className="w-4 h-4" />
                    <span className="font-bold">Target: {currentGame.target}</span>
                  </div>
                  <span className="text-sm">
                    Need {currentGame.target - (currentGame.currentBatsman === 1 ? currentGame.player1Stats.score : currentGame.player2Stats.score)} runs
                  </span>
                </div>
              )}
              
              {currentGame.lastResult && (
                <div className="text-center bg-yellow-900 p-3 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{currentGame.lastResult}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Game Interface */}
          <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className={`text-center text-white rounded-t-lg ${
              getMyRole() === 'batting' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' :
              'bg-gradient-to-r from-red-600 to-pink-600'
            }`}>
              <CardTitle className="text-xl">
                You are {getMyRole() === 'batting' ? 'Batting' : 'Bowling'}
              </CardTitle>
              <p className="text-sm opacity-90">
                {aiThinking ? 'AI is thinking...' : 'Choose your number!'}
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {!aiThinking ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {digitButtons.map(num => (
                      <Button
                        key={num}
                        onClick={() => handleSinglePlayerChoice(num)}
                        className={`aspect-square text-2xl font-bold transition-all transform hover:scale-105 active:scale-95 ${
                          getMyRole() === 'batting' 
                            ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-200' 
                            : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                        } shadow-lg`}
                        size="lg"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center text-3xl mb-4 animate-pulse">
                    🤖
                  </div>
                  <p className="text-gray-600 text-lg">AI is making its choice...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Multiplayer Mode (existing code)
  if (gameMode === 'multiplayer') {
    // Setup Phase
    if (gameState.phase === 'setup') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={() => setGameMode('menu')} />
                <Users className="w-6 h-6" />
                <CardTitle className="text-2xl font-bold">Multiplayer Mode</CardTitle>
              </div>
              <div className="flex items-center justify-center gap-2">
                {connected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-300" />
                    <span className="text-sm text-green-300">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-300" />
                    <span className="text-sm text-red-300">Disconnected</span>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Your Name</label>
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="border-2 border-gray-200 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Room ID</label>
                <Input
                  placeholder="Enter room ID (e.g., ROOM123)"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="border-2 border-gray-200 focus:border-blue-500"
                />
              </div>
              <Button 
                onClick={joinRoom} 
                disabled={!connected || !playerName || !roomId}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg py-3"
              >
                Join Game
              </Button>
              <div className="text-xs text-gray-500 text-center">
                Share the same Room ID with your friend to play together
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Waiting for players
    if (gameState.phase === 'waiting') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
              <CardTitle className="text-2xl font-bold">Waiting for Players</CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-6">
              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
                  <Users className="w-10 h-10 text-blue-600" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold">Room: {roomId}</p>
                  <p className="text-gray-600">Players: {players.length}/2</p>
                </div>
                <div className="space-y-2">
                  {players.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <span className="font-medium">{player.name}</span>
                      <Badge variant={player.id === socket?.id ? "default" : "secondary"}>
                        Player {player.number}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Share room ID "{roomId}" with your friend
              </p>
              <Button onClick={() => setGameMode('menu')} variant="outline" className="w-full">
                Back to Menu
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Toss Phase
    if (gameState.phase === 'toss') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-t-lg">
              <CardTitle className="text-2xl font-bold">Toss Time!</CardTitle>
              <p className="text-green-100">Player {myPlayerNumber}, choose your call</p>
            </CardHeader>
            <CardContent className="p-6 text-center">
              {!isFlipping && !tossResult && (
                <div className="space-y-6">
                  <div className="w-24 h-24 mx-auto bg-yellow-400 rounded-full flex items-center justify-center text-3xl shadow-lg">
                    🏏
                  </div>
                  <div className="space-y-3">
                    <Button 
                      onClick={() => handleToss('heads')} 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-4"
                    >
                      Heads
                    </Button>
                    <Button 
                      onClick={() => handleToss('tails')} 
                      className="w-full bg-red-600 hover:bg-red-700 text-lg py-4"
                    >
                      Tails
                    </Button>
                  </div>
                </div>
              )}
              
              {isFlipping && (
                <div className="space-y-4">
                  <div className="w-24 h-24 mx-auto bg-yellow-400 rounded-full flex items-center justify-center text-3xl shadow-lg animate-spin">
                    🪙
                  </div>
                  <p className="text-lg font-semibold">Flipping coin...</p>
                </div>
              )}
              
              {tossResult && !isFlipping && (
                <div className="space-y-4">
                  <div className="w-24 h-24 mx-auto bg-green-500 rounded-full flex items-center justify-center text-3xl shadow-lg">
                    🎉
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">
                      Result: {tossResult.result.charAt(0).toUpperCase() + tossResult.result.slice(1)}
                    </p>
                    <p className="text-lg font-semibold text-green-600">
                      Player {tossResult.winner} wins the toss!
                    </p>
                    <p className="text-sm text-gray-600">
                      Player {tossResult.winner} will bat first
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // Result Phase
    if (gameState.phase === 'result') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-orange-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className="text-center bg-gradient-to-r from-green-600 to-yellow-600 text-white rounded-t-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-6 h-6" />
                <CardTitle className="text-2xl font-bold">Match Result</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-6">
              <div className="text-6xl">🏆</div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-green-600">
                  {getWinner(gameState) === 'Tie' ? "It's a Tie!" : `${getWinner(gameState)} Wins!`}
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">
                      {players.find(p => p.number === 1)?.name || 'Player 1'}:
                    </span>
                    <span className="text-lg font-mono">{gameState.player1Stats.score}/{gameState.player1Stats.wickets}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">
                      {players.find(p => p.number === 2)?.name || 'Player 2'}:
                    </span>
                    <span className="text-lg font-mono">{gameState.player2Stats.score}/{gameState.player2Stats.wickets}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Button onClick={resetGame} className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-lg py-3">
                  Play Again
                </Button>
                <Button onClick={() => setGameMode('menu')} variant="outline" className="w-full">
                  Back to Menu
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Multiplayer Game Phase
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button 
            onClick={() => setGameMode('menu')} 
            variant="outline" 
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>

          {/* Enhanced Scoreboard */}
          <Card className="bg-gradient-to-r from-gray-900 to-black text-green-400 shadow-2xl border-0">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Target className="w-6 h-6" />
                <CardTitle className="text-2xl font-mono">HAND CRICKET LIVE</CardTitle>
              </div>
              <div className="flex items-center justify-center gap-4">
                <Badge variant="secondary" className="bg-green-600 text-white">
                  Innings {gameState.innings} of 2
                </Badge>
                <Badge variant="outline" className="border-green-400 text-green-400">
                  Room: {roomId}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg transition-all ${gameState.currentBatsman === 1 ? 'bg-green-900 ring-2 ring-green-400' : 'bg-gray-800'}`}>
                  <h3 className="text-lg font-bold text-center">
                    {players.find(p => p.number === 1)?.name || 'Player 1'}
                    {gameState.currentBatsman === 1 && <span className="ml-2 text-yellow-400">🏏</span>}
                  </h3>
                  <div className="text-center font-mono text-3xl">
                    {gameState.player1Stats.score}/{gameState.player1Stats.wickets}
                  </div>
                  <div className="text-center text-sm">
                    {gameState.player1Stats.overs}.{gameState.player1Stats.balls % 6} overs
                  </div>
                </div>
                <div className={`p-4 rounded-lg transition-all ${gameState.currentBatsman === 2 ? 'bg-green-900 ring-2 ring-green-400' : 'bg-gray-800'}`}>
                  <h3 className="text-lg font-bold text-center">
                    {players.find(p => p.number === 2)?.name || 'Player 2'}
                    {gameState.currentBatsman === 2 && <span className="ml-2 text-yellow-400">🏏</span>}
                  </h3>
                  <div className="text-center font-mono text-3xl">
                    {gameState.player2Stats.score}/{gameState.player2Stats.wickets}
                  </div>
                  <div className="text-center text-sm">
                    {gameState.player2Stats.overs}.{gameState.player2Stats.balls % 6} overs
                  </div>
                </div>
              </div>
              
              {gameState.target && (
                <div className="text-center bg-blue-900 p-3 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Target className="w-4 h-4" />
                    <span className="font-bold">Target: {gameState.target}</span>
                  </div>
                  <span className="text-sm">
                    Need {gameState.target - (gameState.currentBatsman === 1 ? gameState.player1Stats.score : gameState.player2Stats.score)} runs
                  </span>
                </div>
              )}
              
              {gameState.lastResult && (
                <div className="text-center bg-yellow-900 p-3 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{gameState.lastResult}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enhanced Game Interface */}
          <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader className={`text-center text-white rounded-t-lg ${
              getMyRole() === 'batting' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' :
              getMyRole() === 'bowling' ? 'bg-gradient-to-r from-red-600 to-pink-600' :
              'bg-gradient-to-r from-gray-600 to-gray-700'
            }`}>
              <CardTitle className="text-xl">
                You are {getMyRole() === 'batting' ? 'Batting' : getMyRole() === 'bowling' ? 'Bowling' : 'Watching'}
              </CardTitle>
              <p className="text-sm opacity-90">
                {isMyTurn() ? 'Your turn - choose a number!' : 
                 gameState.waitingFor === 'batsman' ? 'Waiting for batsman...' : 
                 gameState.waitingFor === 'bowler' ? 'Waiting for bowler...' : 
                 'Waiting for next ball...'}
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {isMyTurn() ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {digitButtons.map(num => (
                      <Button
                        key={num}
                        onClick={() => handlePlayerChoice(num)}
                        className={`aspect-square text-2xl font-bold transition-all transform hover:scale-105 active:scale-95 ${
                          getMyRole() === 'batting' 
                            ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-200' 
                            : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                        } shadow-lg`}
                        size="lg"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center text-3xl mb-4 animate-pulse">
                    ⏳
                  </div>
                  <p className="text-gray-600 text-lg">
                    {gameState.waitingFor === 'batsman' ? 'Batsman is choosing...' : 
                     gameState.waitingFor === 'bowler' ? 'Bowler is choosing...' : 
                     'Waiting for next ball...'}
                  </p>
                  
                  {/* Show choices made */}
                  <div className="mt-4 flex justify-center gap-4">
                    {gameState.choices.batsman && (
                      <div className="bg-blue-100 p-3 rounded-lg">
                        <p className="text-sm text-blue-600">Batsman chose</p>
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">
                          {gameState.choices.batsman}
                        </div>
                      </div>
                    )}
                    {gameState.choices.bowler && (
                      <div className="bg-red-100 p-3 rounded-lg">
                        <p className="text-sm text-red-600">Bowler chose</p>
                        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">
                          {gameState.choices.bowler}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enhanced Game Rules */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
            <CardHeader>
              <CardTitle className="text-center text-lg">Game Rules</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>• Choose a number from 1-6 when it's your turn</p>
              <p>• If both players choose the same number, the batsman is OUT</p>
              <p>• Otherwise, the batsman scores runs equal to their chosen number</p>
              <p>• Each innings has 2 overs (12 balls) or 2 wickets maximum</p>
              <p>• Highest score wins the match!</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}