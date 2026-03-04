import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RegistrationForm } from './components/RegistrationForm';
import { AptitudeTest } from './components/AptitudeTest';
import { ResultView } from './components/ResultView';
import { UserData, AppState, Question, TestStats } from './types';
import { sendTestResults } from './services/emailService';
import { AlertTriangle } from 'lucide-react';
import { cn } from './utils';

export default function App() {
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('aptitude_user_session');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [appState, setAppState] = useState<AppState>(() => {
    const savedUser = localStorage.getItem('aptitude_user_session');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      const testState = localStorage.getItem(`aptitude_test_${parsedUser.rollNumber}`);
      if (testState) return 'test';
      
      const results = localStorage.getItem('aptitude_results');
      if (results) {
        const parsedResults = JSON.parse(results);
        // If the last result belongs to this user, show results
        if (parsedResults.length > 0 && parsedResults[parsedResults.length - 1].rollNumber === parsedUser.rollNumber) {
          return 'result';
        }
      }
    }
    return 'registration';
  });

  const [score, setScore] = useState(() => {
    const saved = localStorage.getItem('aptitude_last_score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [total, setTotal] = useState(() => {
    const saved = localStorage.getItem('aptitude_last_total');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [questions, setQuestions] = useState<Question[]>(() => {
    const saved = localStorage.getItem('aptitude_last_questions');
    return saved ? JSON.parse(saved) : [];
  });
  const [answers, setAnswers] = useState<Record<number, string[]>>(() => {
    const saved = localStorage.getItem('aptitude_last_answers');
    return saved ? JSON.parse(saved) : {};
  });
  const [timeTaken, setTimeTaken] = useState(() => {
    const saved = localStorage.getItem('aptitude_last_time_taken');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [stats, setStats] = useState<TestStats>(() => {
    const saved = localStorage.getItem('aptitude_last_stats');
    return saved ? JSON.parse(saved) : { correct: 0, wrong: 0, skipped: 0, partial: 0 };
  });
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [attempts, setAttempts] = useState(() => {
    const saved = localStorage.getItem('aptitude_attempts');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [retakeAlert, setRetakeAlert] = useState<{ 
    show: boolean; 
    message: string; 
    type: 'warning' | 'error' | 'key-entry';
    inputValue?: string;
    emailValue?: string;
    rollNumberValue?: string;
    error?: string;
  } | null>(null);

  const handleRegister = useCallback((data: UserData) => {
    setUser(data);
    localStorage.setItem('aptitude_user_session', JSON.stringify(data));
    setAppState('test');
  }, []);

  const handleComplete = useCallback(async (finalScore: number, totalQuestions: number, testQuestions: Question[], testAnswers: Record<number, string[]>, testTimeTaken: number, testStats: TestStats) => {
    setScore(finalScore);
    setTotal(totalQuestions);
    setQuestions(testQuestions);
    setAnswers(testAnswers);
    setTimeTaken(testTimeTaken);
    setStats(testStats);
    setAppState('result');
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    // Persist result data for refresh
    localStorage.setItem('aptitude_last_score', finalScore.toString());
    localStorage.setItem('aptitude_last_total', totalQuestions.toString());
    localStorage.setItem('aptitude_last_questions', JSON.stringify(testQuestions));
    localStorage.setItem('aptitude_last_answers', JSON.stringify(testAnswers));
    localStorage.setItem('aptitude_last_time_taken', testTimeTaken.toString());
    localStorage.setItem('aptitude_last_stats', JSON.stringify(testStats));
    localStorage.setItem('aptitude_attempts', newAttempts.toString());

    if (user) {
      setIsSendingEmail(true);
      await sendTestResults(user, finalScore, totalQuestions);
      setIsSendingEmail(false);
    }
  }, [user, attempts]);

  const handleExit = useCallback(() => {
    // Clear session data
    if (user) {
      localStorage.removeItem(`aptitude_test_${user.rollNumber}`);
    }
    localStorage.removeItem('aptitude_user_session');
    localStorage.removeItem('aptitude_last_score');
    localStorage.removeItem('aptitude_last_total');
    localStorage.removeItem('aptitude_last_questions');
    localStorage.removeItem('aptitude_last_answers');
    localStorage.removeItem('aptitude_last_time_taken');
    localStorage.removeItem('aptitude_last_stats');
    localStorage.removeItem('aptitude_attempts');
    
    // Reset state
    setUser(null);
    setAppState('registration');
    setScore(0);
    setTotal(0);
    setQuestions([]);
    setAnswers({});
    setTimeTaken(0);
    setStats({ correct: 0, wrong: 0, skipped: 0, partial: 0 });
    setAttempts(0);
    setIsSendingEmail(false);
    setRetakeAlert(null);
  }, [user]);

  const handleRestart = useCallback(() => {
    if (attempts >= 2) {
      setRetakeAlert({
        show: true,
        type: 'error',
        message: "Only one time Retake allowed. You have already completed your retake attempt."
      });
      return;
    }

    setRetakeAlert({
      show: true,
      type: 'warning',
      message: "Only one time Retake allowed. Click 'Continue' to proceed to key verification."
    });
  }, [attempts]);

  const proceedToKeyEntry = () => {
    setRetakeAlert({
      show: true,
      type: 'key-entry',
      message: "Please enter your authorized credentials to initialize the final attempt.",
      inputValue: '',
      emailValue: '',
      rollNumberValue: '',
      error: ''
    });
  };

  const handleCredentialChange = (field: 'inputValue' | 'emailValue' | 'rollNumberValue', value: string) => {
    setRetakeAlert(prev => prev ? { ...prev, [field]: value, error: '' } : null);
  };

  const validateRetakeCredentials = () => {
    if (!retakeAlert || !user) return;
    
    const { inputValue, emailValue, rollNumberValue } = retakeAlert;

    if (inputValue?.trim() !== "673573") {
      setRetakeAlert(prev => prev ? { ...prev, error: 'Invalid Authorization Key.' } : null);
      return;
    }

    if (emailValue?.trim().toLowerCase() !== user.email.toLowerCase()) {
      setRetakeAlert(prev => prev ? { ...prev, error: 'Email ID does not match registration records.' } : null);
      return;
    }

    if (rollNumberValue?.trim() !== user.rollNumber) {
      setRetakeAlert(prev => prev ? { ...prev, error: 'Roll Number does not match registration records.' } : null);
      return;
    }

    confirmRetake();
  };

  const confirmRetake = () => {
    setRetakeAlert(null);
    setScore(0);
    setAppState('test');
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans overflow-x-hidden">
      {/* Subtle Background Elements */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <nav className="relative z-50 w-full px-4 md:px-8 py-3 md:py-4 flex items-center justify-between max-w-7xl mx-auto border-b border-black/5">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 md:gap-6"
        >
          <div className="h-10 md:h-12 flex items-center justify-center overflow-hidden">
            <img 
              src="https://ik.imagekit.io/qjw6xz1vo/NICHE%20TECHIES.svg" 
              alt="Niche Techies Logo" 
              className="h-full w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-sans font-bold tracking-tight leading-none">Aptitude</span>
            <span className="text-[9px] tracking-[0.3em] text-black/40 font-bold mt-1">Professional Evaluation</span>
          </div>
        </motion.div>
      </nav>

      <main className="relative z-10 flex flex-col items-center justify-start md:justify-center min-h-[calc(100vh-120px)] px-0 md:px-4 py-4">
        <AnimatePresence>
          {retakeAlert?.show && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-md bg-white border border-black p-10 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-black text-white flex items-center justify-center mx-auto mb-8">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-sans font-bold tracking-tight mb-4">
                  {retakeAlert.type === 'error' ? 'Limit Reached' : 'Retake Policy'}
                </h4>
                <p className="text-black/60 text-sm font-medium leading-relaxed mb-10 tracking-tight">
                  {retakeAlert.message}
                </p>
                <div className="flex flex-col gap-4">
                  {retakeAlert.type === 'warning' ? (
                    <>
                      <button
                        onClick={proceedToKeyEntry}
                        className="w-full py-4 bg-black text-white font-bold tracking-[0.3em] text-[10px] hover:bg-black/90 transition-all"
                      >
                        Continue
                      </button>
                      <button
                        onClick={() => window.location.reload()}
                        className="w-full py-4 bg-white text-black/40 border border-black/10 font-bold tracking-[0.3em] text-[10px] hover:text-black transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  ) : retakeAlert.type === 'key-entry' ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-4">
                        <div className="relative">
                          <span className="text-[8px] font-bold tracking-widest text-black/40 mb-1 block text-left">Authorization Key</span>
                          <input
                            autoFocus
                            type="password"
                            value={retakeAlert.inputValue}
                            onChange={(e) => handleCredentialChange('inputValue', e.target.value)}
                            placeholder="Enter Key"
                            className={cn(
                              "w-full bg-black/5 border-b px-4 py-3 text-center font-mono text-lg tracking-widest focus:outline-none transition-all",
                              retakeAlert.error?.includes('Key') ? "border-red-500" : "border-black/20 focus:border-black focus:bg-black/10"
                            )}
                          />
                        </div>
                        <div className="relative">
                          <span className="text-[8px] font-bold tracking-widest text-black/40 mb-1 block text-left">Email ID</span>
                          <input
                            type="email"
                            value={retakeAlert.emailValue}
                            onChange={(e) => handleCredentialChange('emailValue', e.target.value)}
                            placeholder="Confirm Email"
                            className={cn(
                              "w-full bg-black/5 border-b px-4 py-3 text-center font-sans text-sm tracking-tight focus:outline-none transition-all",
                              retakeAlert.error?.includes('Email') ? "border-red-500" : "border-black/20 focus:border-black focus:bg-black/10"
                            )}
                          />
                        </div>
                        <div className="relative">
                          <span className="text-[8px] font-bold tracking-widest text-black/40 mb-1 block text-left">Roll Number</span>
                          <input
                            type="text"
                            value={retakeAlert.rollNumberValue}
                            onChange={(e) => handleCredentialChange('rollNumberValue', e.target.value)}
                            placeholder="Confirm Roll Number"
                            className={cn(
                              "w-full bg-black/5 border-b px-4 py-3 text-center font-sans text-sm tracking-tight focus:outline-none transition-all",
                              retakeAlert.error?.includes('Roll') ? "border-red-500" : "border-black/20 focus:border-black focus:bg-black/10"
                            )}
                          />
                        </div>
                        {retakeAlert.error && (
                          <span className="text-[9px] text-red-500 font-bold tracking-widest mt-2 block">
                            {retakeAlert.error}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={validateRetakeCredentials}
                          className="w-full py-4 bg-black text-white font-bold tracking-[0.3em] text-[10px] hover:bg-black/90 transition-all"
                        >
                          Verify & Start
                        </button>
                        <button
                          onClick={() => setRetakeAlert(null)}
                          className="text-[9px] font-bold tracking-widest text-black/40 hover:text-black transition-colors py-2"
                        >
                          Back to Results
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRetakeAlert(null)}
                      className="w-full py-4 bg-black text-white font-bold tracking-[0.3em] text-[10px] hover:bg-black/90 transition-all"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {appState === 'registration' && (
            <RegistrationForm key="reg" onRegister={handleRegister} />
          )}

          {appState === 'test' && user && (
            <motion.div
              key="test"
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="w-full"
            >
              <AptitudeTest user={user} onComplete={handleComplete} onExit={handleExit} />
            </motion.div>
          )}

          {appState === 'result' && user && (
            <ResultView
              key="result"
              user={user}
              score={score}
              total={total}
              questions={questions}
              answers={answers}
              timeTaken={timeTaken}
              stats={stats}
              onRestart={handleRestart}
              onExit={handleExit}
              attempts={attempts}
            />
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-10 w-full py-8 text-center">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center gap-4">
          <p className="text-zinc-600 text-[10px] tracking-[0.3em]">
            &copy; 2026 Niche Techies &bull; Global Standard Assessment
          </p>
          <button 
            onClick={handleExit}
            className="text-[8px] tracking-[0.4em] text-black/20 hover:text-red-500 transition-colors font-bold uppercase"
          >
            Reset Application Session
          </button>
        </div>
      </footer>
    </div>
  );
}
