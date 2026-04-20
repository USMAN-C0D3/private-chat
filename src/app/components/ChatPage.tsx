import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Send, MoreVertical, Phone, Video } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: string;
}

export function ChatPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hey! How are you?',
      sender: 'them',
      timestamp: '10:30 AM',
    },
    {
      id: '2',
      text: "I'm good! Just working on some new designs 😊",
      sender: 'me',
      timestamp: '10:32 AM',
    },
    {
      id: '3',
      text: 'That sounds exciting! Can you show me?',
      sender: 'them',
      timestamp: '10:33 AM',
    },
    {
      id: '4',
      text: 'Sure! Let me send you some screenshots',
      sender: 'me',
      timestamp: '10:35 AM',
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'me',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([...messages, newMessage]);
    setInputValue('');

    // Simulate typing indicator and response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: 'That looks amazing! 💜',
        sender: 'them',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, response]);
    }, 2000);
  };

  const chatPartner = {
    name: 'Alex',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    online: true,
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-950 via-purple-950/50 to-slate-900 flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-30 backdrop-blur-xl bg-slate-900/70 border-b border-white/5"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Left side */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate('/chats')}
                className="p-2 rounded-full hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-purple-200" />
              </motion.button>

              <div className="relative">
                <img
                  src={chatPartner.avatar}
                  alt={chatPartner.name}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover ring-2 ring-purple-500/30"
                />
                {chatPartner.online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
                )}
              </div>

              <div>
                <h2 className="text-white font-semibold">{chatPartner.name}</h2>
                <p className="text-xs text-green-400">Online</p>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors hidden sm:block"
              >
                <Phone className="w-5 h-5 text-purple-200" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors hidden sm:block"
              >
                <Video className="w-5 h-5 text-purple-200" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-purple-200" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] ${
                    message.sender === 'me' ? 'order-1' : 'order-2'
                  }`}
                >
                  {/* Message bubble */}
                  <div
                    className={`relative px-4 py-3 rounded-2xl ${
                      message.sender === 'me'
                        ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-br-sm'
                        : 'bg-white/10 backdrop-blur-sm border border-white/10 text-purple-100 rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm sm:text-base leading-relaxed">{message.text}</p>
                    
                    {/* Timestamp */}
                    <div className={`mt-1 text-xs ${
                      message.sender === 'me' ? 'text-purple-200/70' : 'text-purple-300/50'
                    }`}>
                      {message.timestamp}
                    </div>

                    {/* Message glow effect for sent messages */}
                    {message.sender === 'me' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl blur-xl opacity-20 -z-10" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex justify-start"
              >
                <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl rounded-bl-sm px-5 py-3">
                  <div className="flex gap-1.5">
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      className="w-2 h-2 bg-purple-300 rounded-full"
                    />
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      className="w-2 h-2 bg-purple-300 rounded-full"
                    />
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      className="w-2 h-2 bg-purple-300 rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="sticky bottom-0 backdrop-blur-xl bg-slate-900/70 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <form onSubmit={handleSend} className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                className="w-full px-5 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-400/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all duration-300 resize-none max-h-32"
              />
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!inputValue.trim()}
              className="flex-shrink-0 p-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </form>

          {/* Message counter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-2 text-center text-xs text-purple-300/40"
          >
            {messages.length} messages • End-to-end encrypted
          </motion.div>
        </div>
      </div>
    </div>
  );
}
