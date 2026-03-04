import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Clock, User, Hash, Timer, LogOut, RefreshCcw, BarChart as BarChartIcon } from 'lucide-react';
import { UserData, Question, TestStats } from '../types';
import { cn } from '../utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ResultViewProps {
  user: UserData;
  score: number;
  total: number;
  questions: Question[];
  answers: Record<number, string[]>;
  timeTaken: number;
  stats: TestStats;
  onRestart: () => void;
  onExit: () => void;
  attempts: number;
}

export const ResultView: React.FC<ResultViewProps> = ({ user, score, total, questions, answers, timeTaken, stats, onRestart, onExit, attempts }) => {
  const percentage = (score / total) * 100;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const chartData = [
    { name: 'Correct', value: stats.correct, color: '#22c55e' },
    { name: 'Partial', value: stats.partial, color: '#eab308' },
    { name: 'Wrong', value: stats.wrong, color: '#ef4444' },
    { name: 'Skipped', value: stats.skipped, color: '#94a3b8' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl mx-auto bg-white border-x-0 md:border border-black/10 shadow-none md:shadow-2xl relative overflow-hidden flex flex-col min-h-[600px]"
    >
      {/* Main Panel: Summary */}
      <div className="w-full bg-black text-white p-6 md:p-10 flex flex-col relative overflow-hidden flex-grow">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/[0.03] rounded-full -mr-48 -mt-48 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/[0.02] rounded-full -ml-48 -mb-48 blur-3xl" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-white/10 flex items-center justify-center mb-6">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl md:text-4xl font-sans font-bold mb-2 tracking-tight">
            Thanks for Submitting
          </h2>
          <p className="text-white/40 text-sm font-medium mb-10 tracking-tight max-w-md">
            Your evaluation session has been completed and saved securely in our system. Our technical team will evaluate and let you know.
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="text-3xl font-bold text-green-400">{stats.correct}</div>
              <div className="text-[10px] font-bold tracking-widest text-white/30 uppercase mt-1">Correct</div>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="text-3xl font-bold text-yellow-400">{stats.partial}</div>
              <div className="text-[10px] font-bold tracking-widest text-white/30 uppercase mt-1">Partial</div>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="text-3xl font-bold text-red-400">{stats.wrong}</div>
              <div className="text-[10px] font-bold tracking-widest text-white/30 uppercase mt-1">Wrong</div>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="text-3xl font-bold text-zinc-400">{stats.skipped}</div>
              <div className="text-[10px] font-bold tracking-widest text-white/30 uppercase mt-1">Skipped</div>
            </div>
          </div>

          {/* Visual Chart */}
          <div className="w-full h-64 bg-white/5 p-6 rounded-2xl border border-white/10 mb-10">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff40', fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff40', fontSize: 10, fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-10">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">Candidate</span>
              <div className="flex items-center justify-center gap-3">
                <User className="w-4 h-4 text-white/40" />
                <span className="font-bold text-xl">{user.name}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">Roll Number</span>
              <div className="flex items-center justify-center gap-3">
                <Hash className="w-4 h-4 text-white/40" />
                <span className="font-mono font-bold text-xl">{user.rollNumber}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">Duration</span>
              <div className="flex items-center justify-center gap-3">
                <Clock className="w-4 h-4 text-white/40" />
                <span className="font-mono font-bold text-xl">{formatTime(timeTaken)}</span>
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col md:flex-row gap-6">
            <button
              onClick={onRestart}
              className="flex-1 flex items-center justify-center gap-4 py-5 bg-white text-black font-bold tracking-[0.2em] text-[11px] hover:bg-white/90 transition-all shadow-xl"
            >
              <RefreshCcw className="w-4 h-4" />
              Retake
            </button>
            <button
              onClick={onExit}
              className="flex-1 flex items-center justify-center gap-4 py-5 bg-transparent border border-white/20 text-white/60 font-bold tracking-[0.2em] text-[11px] hover:text-white hover:border-white transition-all"
            >
              <LogOut className="w-4 h-4" />
              Exit
            </button>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 py-6 px-10 flex items-center justify-between opacity-40 border-t border-black/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-black" />
          <span className="text-[9px] font-bold tracking-[0.2em] text-black">Session Security Verified</span>
        </div>
        <span className="text-[9px] font-mono text-black font-bold">
          {new Date().toLocaleDateString()} &bull; {new Date().toLocaleTimeString()}
        </span>
      </div>
    </motion.div>
  );
};
