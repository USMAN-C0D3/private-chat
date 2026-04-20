import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { MessageCircle, Search, MoreVertical, Circle } from 'lucide-react';

export function ChatListPage() {
  const navigate = useNavigate();

  // Mock chat data
  const chat = {
    id: '1',
    name: 'Alex',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    lastMessage: 'See you tomorrow! 💜',
    timestamp: '2m ago',
    unread: 2,
    online: true,
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-purple-950/50 to-slate-900">
      {/* Header */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-30 backdrop-blur-xl bg-slate-900/70 border-b border-white/5"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-md opacity-50" />
                <div className="relative bg-gradient-to-br from-purple-500/30 to-blue-500/30 p-2 rounded-full">
                  <MessageCircle className="w-6 h-6 text-purple-300" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Messages</h1>
                <p className="text-xs text-purple-200/50">Private Chat</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-purple-200" />
            </motion.button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300/50" />
            <input
              type="text"
              placeholder="Search messages..."
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-400/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all duration-300"
            />
          </div>
        </div>
      </motion.div>

      {/* Chat list */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate(`/chat/${chat.id}`)}
          className="group relative cursor-pointer"
        >
          {/* Hover glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-blue-500/0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Chat item */}
          <div className="relative flex items-center gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-purple-400/30 hover:bg-white/10 transition-all duration-300">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <img
                src={chat.avatar}
                alt={chat.name}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-2 ring-purple-500/30"
              />
              {/* Online indicator */}
              {chat.online && (
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
              )}
            </div>

            {/* Chat info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold text-lg truncate">{chat.name}</h3>
                <span className="text-xs text-purple-200/50 ml-2 flex-shrink-0">{chat.timestamp}</span>
              </div>
              <p className="text-purple-200/70 text-sm truncate">{chat.lastMessage}</p>
            </div>

            {/* Unread badge */}
            {chat.unread > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-purple-500/50"
              >
                {chat.unread}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Empty state message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 border border-white/10 mb-4">
            <Circle className="w-8 h-8 text-purple-300/30" />
          </div>
          <p className="text-purple-200/40 text-sm">Your private conversation space</p>
        </motion.div>
      </div>
    </div>
  );
}
