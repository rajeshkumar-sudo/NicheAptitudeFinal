import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  ChevronLeft, 
  Send, 
  CheckCircle, 
  XCircle,
  Wifi,
  WifiOff,
  Save,
  Cloud,
  HardDrive,
  Database,
  BarChart
} from 'lucide-react';
import { Question, UserData, QuestionsData } from '../types';
import { cn } from '../utils';
import questionsRaw from '../questions.json';

const questionsData = questionsRaw as unknown as QuestionsData;

interface AptitudeTestProps {
  user: UserData;
  onComplete: (score: number, total: number, questions: Question[], answers: Record<number, string>, timeTaken: number) => void;
}

export const AptitudeTest: React.FC<AptitudeTestProps> = ({ user, onComplete }) => {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const [selectedSetIndex] = useState(() => Math.floor(Math.random() * questionsData.sets.length));
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes in seconds
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [violations, setViolations] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  
  // Answer statistics
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [skippedQuestions, setSkippedQuestions] = useState(0);
  const [partialCorrectAnswers, setPartialCorrectAnswers] = useState(0);
  
  // Refs
  const lastViolationTime = useRef(0);
  const isAway = useRef(false);
  const submissionStarted = useRef(false);
  
  // ============================================
  // SECURITY ALERT STATE
  // ============================================
  const [securityAlert, setSecurityAlert] = useState<{ 
    show: boolean; 
    message: string; 
    count: number; 
    isInitial?: boolean 
  } | null>({
    show: true,
    isInitial: true,
    count: 0,
    message: "Warning: Do not minimize the window or switch tabs during the test. This is violation 0 out of 3. If you do this 3 times, the test will be submitted automatically. Please keep the test in full screen."
  });

  // ============================================
  // CONSTANTS
  // ============================================
  const selectedSet = questionsData.sets[selectedSetIndex];
  const questions: Question[] = selectedSet.questions;
  
  const DIFFICULTY_TIMES = {
    'Easy': 40,
    'Medium': 60,
    'Hard': 100
  };

  // GOOGLE APPS SCRIPT URL - REPLACE WITH YOUR DEPLOYED URL
  const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyPdPt3FNO-rmFl2RHdzDnptN1qXFCBHAJAgWOBqPmWDyVid-wG5E3kEA9BXyrd-_Vv/exec';

  // ============================================
  // ONLINE STATUS MONITOR
  // ============================================
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('📶 Device is online');
      syncFailedSubmissions();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      console.log('📶 Device is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ============================================
  // SYNC FAILED SUBMISSIONS
  // ============================================
  const syncFailedSubmissions = async () => {
    try {
      const failed = JSON.parse(localStorage.getItem('aptitude_failed') || '[]');
      if (failed.length === 0) return;
      
      console.log(`🔄 Attempting to sync ${failed.length} failed submissions...`);
      
      const successful: number[] = [];
      
      for (let i = 0; i < failed.length; i++) {
        const submission = failed[i];
        const success = await submitToGoogleSheets(submission);
        
        if (success) {
          successful.push(i);
        }
      }
      
      // Remove successful submissions
      const remaining = failed.filter((_: any, index: number) => !successful.includes(index));
      localStorage.setItem('aptitude_failed', JSON.stringify(remaining));
      
      if (successful.length > 0) {
        console.log(`✅ Synced ${successful.length} submissions`);
      }
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
    }
  };

  // ============================================
  // GET BROWSER INFO
  // ============================================
  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    const browser = (() => {
      if (ua.indexOf('Chrome') > -1) return 'Chrome';
      if (ua.indexOf('Firefox') > -1) return 'Firefox';
      if (ua.indexOf('Safari') > -1) return 'Safari';
      if (ua.indexOf('Edge') > -1) return 'Edge';
      return 'Unknown';
    })();
    
    const platform = navigator.platform;
    const language = navigator.language;
    const screenSize = `${window.screen.width}x${window.screen.height}`;
    
    return `${browser} on ${platform}, ${language}, ${screenSize}`;
  };

  // ============================================
  // SUBMIT TO GOOGLE SHEETS
  // ============================================
  const submitToGoogleSheets = async (payload: any): Promise<boolean> => {
    console.log('📤 Submitting to Google Sheets:', payload);

    // METHOD 1: Try fetch with JSON
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Google Sheets response:', result);
        
        if (result.status === 'success') {
          setSubmissionId(result.submissionId || null);
          
          if (result.statistics) {
            console.log('📊 Server received statistics:', result.statistics);
          }
          
          return true;
        }
      }
    } catch (jsonError) {
      console.log('JSON fetch failed, trying form data...', jsonError);
    }

    // METHOD 2: Try with FormData
    try {
      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));

      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Google Sheets response (FormData):', result);
        
        if (result.status === 'success') {
          setSubmissionId(result.submissionId || null);
          return true;
        }
      }
    } catch (formError) {
      console.log('FormData failed, trying no-cors...', formError);
    }

    // METHOD 3: Try with no-cors mode
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      console.log('✅ Request sent with no-cors mode');
      return true;
      
    } catch (noCorsError) {
      console.error('❌ All submission methods failed:', noCorsError);
      return false;
    }
  };

  // ============================================
  // CHECK IF ANSWER IS CORRECT (HANDLES MULTIPLE CORRECT ANSWERS)
  // ============================================
  const isAnswerCorrect = (question: Question, userAnswer: string[]): boolean => {
    // Get the correct answer(s) from the question
    const correctAnswer = question.answer;
    
    // If no answer selected
    if (!userAnswer || userAnswer.length === 0) return false;
    
    // Case 1: Single correct answer (string)
    if (typeof correctAnswer === 'string') {
      return userAnswer.length === 1 && userAnswer[0] === correctAnswer;
    }
    
    // Case 2: Multiple correct answers (array)
    if (Array.isArray(correctAnswer)) {
      // Sort both arrays to compare regardless of order
      const sortedUserAnswer = [...userAnswer].sort();
      const sortedCorrectAnswer = [...correctAnswer].sort();
      
      // Check if arrays are equal
      return sortedUserAnswer.length === sortedCorrectAnswer.length &&
             sortedUserAnswer.every((value, index) => value === sortedCorrectAnswer[index]);
    }
    
    return false;
  };

  // ============================================
  // CHECK IF ANSWER IS PARTIALLY CORRECT (FOR MULTIPLE ANSWER QUESTIONS)
  // ============================================
  const isAnswerPartiallyCorrect = (question: Question, userAnswer: string[]): boolean => {
    const correctAnswer = question.answer;
    
    if (!userAnswer || userAnswer.length === 0) return false;
    if (!Array.isArray(correctAnswer)) return false; // Only relevant for multiple answer questions
    
    // Check if user selected some correct answers but not all
    const isFullyCorrect = isAnswerCorrect(question, userAnswer);
    if (isFullyCorrect) return false;
    
    // Check if at least one answer is correct
    return userAnswer.some(ans => correctAnswer.includes(ans));
  };

  // ============================================
  // GET CORRECT ANSWERS COUNT
  // ============================================
  const getAnswerCounts = () => {
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let partialCount = 0;
    const correctAnswerIds: string[] = [];
    const wrongAnswerIds: string[] = [];
    const skippedQuestionIds: string[] = [];
    const partialAnswerIds: string[] = [];
    
    questions.forEach((q) => {
      const userAnswer = answers[q.id] || [];
      
      if (userAnswer.length === 0) {
        // Question was skipped/unanswered
        skippedCount++;
        skippedQuestionIds.push(q.id.toString());
      } else if (isAnswerCorrect(q, userAnswer)) {
        // Fully correct answer
        correctCount++;
        correctAnswerIds.push(q.id.toString());
      } else if (isAnswerPartiallyCorrect(q, userAnswer)) {
        // Partially correct (for multiple answer questions)
        partialCount++;
        partialAnswerIds.push(q.id.toString());
      } else {
        // Completely wrong answer
        wrongCount++;
        wrongAnswerIds.push(q.id.toString());
      }
    });
    
    return {
      correctCount,
      wrongCount,
      skippedCount,
      partialCount,
      correctAnswerIds,
      wrongAnswerIds,
      skippedQuestionIds,
      partialAnswerIds
    };
  };

  // ============================================
  // HANDLE FINAL SUBMISSION
  // ============================================
  const handleSubmit = async () => {
    // Prevent double submission
    if (isSubmitted || isSubmitting || submissionStarted.current) {
      console.log('Submission already in progress');
      return;
    }
    
    submissionStarted.current = true;
    setIsSubmitted(true);
    setIsSubmitting(true);
    setSubmitStatus('saving');
    setSubmitMessage('Saving your results to Google Sheets...');

    console.log('🎯 Starting final submission...');
    
    // ============================================
    // Calculate detailed answer statistics
    // ============================================
    const counts = getAnswerCounts();
    
    setCorrectAnswers(counts.correctCount);
    setWrongAnswers(counts.wrongCount);
    setSkippedQuestions(counts.skippedCount);
    setPartialCorrectAnswers(counts.partialCount);
    
    const totalQuestions = questions.length;
    const score = counts.correctCount;
    const timeTaken = (30 * 60) - timeLeft;
    const percentage = ((score / totalQuestions) * 100).toFixed(2);
    
    console.log('📊 Detailed Test Results:', {
      totalQuestions,
      correctAnswers: counts.correctCount,
      partialCorrect: counts.partialCount,
      wrongAnswers: counts.wrongCount,
      skippedQuestions: counts.skippedCount,
      score,
      percentage: percentage + '%',
      timeTaken,
      correctAnswerIds: counts.correctAnswerIds,
      partialAnswerIds: counts.partialAnswerIds,
      wrongAnswerIds: counts.wrongAnswerIds,
      skippedQuestionIds: counts.skippedQuestionIds
    });

    // ============================================
    // Prepare enhanced payload with all data
    // ============================================
    const payload = {
      // User info
      name: user.name,
      email: user.email,
      phone: user.phone,
      rollNumber: user.rollNumber,
      
      // Test metadata
      totalQuestions: totalQuestions,
      correctAnswers: counts.correctCount,
      partialCorrect: counts.partialCount,
      wrongAnswers: counts.wrongCount,
      skippedQuestions: counts.skippedCount,
      score: score,
      total: totalQuestions,
      set: selectedSetIndex,
      timeTaken: timeTaken,
      timestamp: new Date().toISOString(),
      
      // Detailed answer tracking
      answers: answers,
      correctAnswerIds: counts.correctAnswerIds,
      partialAnswerIds: counts.partialAnswerIds,
      wrongAnswerIds: counts.wrongAnswerIds,
      skippedQuestionIds: counts.skippedQuestionIds,
      
      // Browser info
      browserInfo: getBrowserInfo(),
      userAgent: navigator.userAgent
    };

    // Try to submit to Google Sheets
    setSubmitMessage('Connecting to Google Sheets...');
    const cloudSuccess = await submitToGoogleSheets(payload);
    
    if (cloudSuccess) {
      setSubmitStatus('success');
      setSubmitMessage(
        `✓ Results saved to Google Sheets!`
      );
      console.log('✅ Cloud save successful');
      
      // Save to localStorage as backup
      const results = JSON.parse(localStorage.getItem('aptitude_results') || '[]');
      results.push({
        ...user,
        totalQuestions,
        correctAnswers: counts.correctCount,
        partialCorrect: counts.partialCount,
        wrongAnswers: counts.wrongCount,
        skippedQuestions: counts.skippedCount,
        score,
        percentage,
        timeTaken,
        set: selectedSetIndex + 1,
        timestamp: new Date().toISOString(),
        submissionId: submissionId,
        synced: true
      });
      localStorage.setItem('aptitude_results', JSON.stringify(results));
      
    } else {
      // Save to localStorage for later sync
      setSubmitStatus('error');
      setSubmitMessage(
        isOnline 
          ? '⚠️ Google Sheets save failed. Results saved locally.'
          : '📴 You are offline. Results saved locally.'
      );
      
      const failed = JSON.parse(localStorage.getItem('aptitude_failed') || '[]');
      failed.push(payload);
      localStorage.setItem('aptitude_failed', JSON.stringify(failed));
      
      const results = JSON.parse(localStorage.getItem('aptitude_results') || '[]');
      results.push({
        ...user,
        totalQuestions,
        correctAnswers: counts.correctCount,
        partialCorrect: counts.partialCount,
        wrongAnswers: counts.wrongCount,
        skippedQuestions: counts.skippedCount,
        score,
        percentage,
        timeTaken,
        set: selectedSetIndex + 1,
        timestamp: new Date().toISOString(),
        synced: false
      });
      localStorage.setItem('aptitude_results', JSON.stringify(results));
      
      console.log('💾 Saved to localStorage');
    }
    
    // Call the original onComplete prop
    onComplete(score, totalQuestions, questions, answers, timeTaken);
    
    // Clear submitting state after delay
    setTimeout(() => {
      setIsSubmitting(false);
      submissionStarted.current = false;
    }, 3000);
  };

  // ============================================
  // QUESTION TIMER EFFECT
  // ============================================
  useEffect(() => {
    if (questions[currentQuestionIndex]) {
      const difficulty = questions[currentQuestionIndex].difficulty || 'Medium';
      setQuestionTimeLeft(DIFFICULTY_TIMES[difficulty as keyof typeof DIFFICULTY_TIMES]);
    }
  }, [currentQuestionIndex, questions]);

  // ============================================
  // SECURITY VIOLATION HANDLERS
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;

    const handleSecurityViolation = (message: string) => {
      const now = Date.now();
      if (now - lastViolationTime.current < 2000) return;
      lastViolationTime.current = now;

      setViolations((prev) => {
        const newCount = prev + 1;
        if (newCount >= 3) {
          setSecurityAlert({ 
            show: true, 
            message: `WARNING: Maximum security violations reached. Test will be submitted automatically.`,
            count: 3 
          });
          setTimeout(() => handleSubmit(), 3000);
          return 3;
        } else {
          setSecurityAlert({ 
            show: true, 
            message: `Security Violation ${newCount}/3: ${message}. Please stay on this tab.`,
            count: newCount
          });
          return newCount;
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !isSubmitted) {
        isAway.current = true;
      } else if (document.visibilityState === 'visible' && isAway.current && !isSubmitted) {
        handleSecurityViolation('Tab switching detected');
        isAway.current = false;
      }
    };

    const handleBlur = () => {
      if (!isSubmitted) {
        isAway.current = true;
      }
    };

    const handleFocus = () => {
      if (isAway.current && !isSubmitted) {
        handleSecurityViolation('Window focus lost');
        isAway.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isSubmitted, hasStarted]);

  // ============================================
  // MAIN TIMER EFFECT
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;

    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
      
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prevIndex => prevIndex + 1);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, hasStarted, isSubmitted, currentQuestionIndex, questions.length]);

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (optionKey: string) => {
    const currentQ = questions[currentQuestionIndex];
    const isMultipleAnswer = Array.isArray(currentQ.answer);
    
    setAnswers(prev => {
      const currentAnswers = prev[currentQ.id] || [];
      
      if (isMultipleAnswer) {
        // For multiple answer questions, toggle the selection
        if (currentAnswers.includes(optionKey)) {
          // Remove if already selected
          return {
            ...prev,
            [currentQ.id]: currentAnswers.filter(k => k !== optionKey)
          };
        } else {
          // Add if not selected
          return {
            ...prev,
            [currentQ.id]: [...currentAnswers, optionKey]
          };
        }
      } else {
        // For single answer questions, replace with new selection
        return {
          ...prev,
          [currentQ.id]: [optionKey]
        };
      }
    });
  };

  const isOptionSelected = (questionId: number, optionKey: string): boolean => {
    return (answers[questionId] || []).includes(optionKey);
  };

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
  const isMultipleAnswer = currentQuestion && Array.isArray(currentQuestion.answer);

  // ============================================
  // RENDER COMPONENT
  // ============================================
  if (!currentQuestion) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-4 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-black/20 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {isSubmitted ? "Finalizing assessment..." : "Loading assessment..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-4 min-h-screen bg-gray-50">
      
      {/* ======================================== */}
      {/* STATUS BAR */}
      {/* ======================================== */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 py-2 bg-white border-b border-gray-200 text-xs shadow-sm">
        <div className="flex items-center gap-3">
          {/* Online Status */}
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full",
            isOnline ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
          )}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="font-medium">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          
          {/* Submission Status */}
          {submissionId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
              <Database className="w-3 h-3" />
              <span className="font-medium">ID: {submissionId}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-gray-500">ID: {user.rollNumber}</span>
          <span className="text-gray-500">{user.name}</span>
        </div>
      </div>

      {/* ======================================== */}
      {/* SECURITY ALERT DIALOG */}
      {/* ======================================== */}
      <AnimatePresence>
        {securityAlert?.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white border-2 border-black p-8 shadow-2xl text-center rounded-xl"
            >
              <div className={cn(
                "w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center",
                securityAlert.count >= 3 ? "bg-red-500" : "bg-black"
              )}>
                <AlertTriangle className="w-10 h-10 text-white" />
              </div>
              
              <h4 className="text-2xl font-bold mb-4">
                {securityAlert.count >= 3 ? 'Test Submitted' : 'Security Alert'}
              </h4>
              
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-black mb-2">
                  {securityAlert.count}/3
                </div>
                <div className="text-sm text-gray-600">Security Violations</div>
              </div>
              
              <p className="text-gray-700 mb-8">
                {securityAlert.message}
              </p>
              
              {securityAlert.count < 3 && (
                <button
                  onClick={() => {
                    setSecurityAlert(null);
                    if (securityAlert.isInitial) {
                      lastViolationTime.current = Date.now();
                      setHasStarted(true);
                    }
                  }}
                  className="w-full py-4 bg-black text-white font-bold hover:bg-gray-800 transition-all rounded-lg"
                >
                  {securityAlert.isInitial ? "I Understand & Begin Test" : "Acknowledge & Continue"}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================== */}
      {/* SUBMIT STATUS MODAL */}
      {/* ======================================== */}
      <AnimatePresence>
        {isSubmitted && submitStatus !== 'idle' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-white p-8 shadow-2xl text-center rounded-xl"
            >
              {submitStatus === 'saving' && (
                <>
                  <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-black rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Saving Your Results</h3>
                  <p className="text-gray-600 mb-4">{submitMessage}</p>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <Save className="w-4 h-4" />
                    <span>Please wait while we save to Google Sheets...</span>
                  </div>
                </>
              )}
              
              {submitStatus === 'success' && (
                <>
                  <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-12 h-12" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Test Completed Successfully!</h3>
                  <p className="text-gray-700 mb-6">{submitMessage}</p>
                  
                  {/* Answer Statistics Breakdown */}
                  <div className="bg-green-50 p-4 rounded-lg mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-800">Your Results</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600">{correctAnswers}</div>
                        <div className="text-xs text-gray-600 mt-1">Correct</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-yellow-500">{partialCorrectAnswers}</div>
                        <div className="text-xs text-gray-600 mt-1">Partial</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-red-500">{wrongAnswers}</div>
                        <div className="text-xs text-gray-600 mt-1">Wrong</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-gray-400">{skippedQuestions}</div>
                        <div className="text-xs text-gray-600 mt-1">Skipped</div>
                      </div>
                    </div>
                    
                    <div className="text-center pt-3 border-t border-green-200">
                      <div className="text-sm text-gray-600 mb-1">Total Questions: {questions.length}</div>
                      <div className="text-2xl font-bold text-green-700">
                        {((correctAnswers/questions.length)*100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg mb-6 text-left">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Submission ID:</span>
                      <span className="font-mono font-bold">{submissionId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Saved to:</span>
                      <span className="font-medium text-green-700">Google Sheets ✓</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-500">You may now close this window.</p>
                </>
              )}
              
              {submitStatus === 'error' && (
                <>
                  <div className="w-24 h-24 bg-yellow-500 text-white rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="w-12 h-12" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Results Saved Locally</h3>
                  <p className="text-gray-700 mb-4">{submitMessage}</p>
                  
                  {/* Answer Statistics Breakdown (even for error) */}
                  <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{correctAnswers}</div>
                        <div className="text-xs text-gray-600">Correct</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-500">{partialCorrectAnswers}</div>
                        <div className="text-xs text-gray-600">Partial</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-500">{wrongAnswers}</div>
                        <div className="text-xs text-gray-600">Wrong</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-400">{skippedQuestions}</div>
                        <div className="text-xs text-gray-600">Skipped</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg mb-6 text-left">
                    <p className="text-sm text-yellow-800 mb-2 flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      <span>Your results are safely stored in your browser</span>
                    </p>
                    <p className="text-sm text-yellow-800 flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      <span>Will auto-sync to Google Sheets when online</span>
                    </p>
                  </div>
                  
                  <button
                    onClick={() => window.location.href = '/'}
                    className="px-8 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                  >
                    Return to Home
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================== */}
      {/* MAIN CONTENT */}
      {/* ======================================== */}
      <div className="pt-16">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-3xl font-bold text-black tracking-tight">{user.name}</h2>
            <p className="text-gray-500 font-medium mt-1">Technical Aptitude Evaluation</p>
          </motion.div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Total Timer */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-1 min-w-[140px] bg-white p-3 rounded-lg shadow-sm border border-gray-100"
            >
              <span className="text-xs font-bold tracking-widest text-gray-400">TOTAL TIME</span>
              <div className="flex items-center gap-3">
                <Clock className={cn("w-5 h-5", timeLeft < 300 ? "text-red-500 animate-pulse" : "text-gray-400")} />
                <span className={cn("font-mono text-2xl font-bold", timeLeft < 300 ? "text-red-500" : "text-gray-800")}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            </motion.div>

            {/* Question Timer */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col gap-1 min-w-[140px] bg-white p-3 rounded-lg shadow-sm border border-gray-100"
            >
              <span className="text-xs font-bold tracking-widest text-gray-400">QUESTION TIME</span>
              <div className="flex items-center gap-3">
                <Clock className={cn("w-5 h-5", questionTimeLeft < 10 ? "text-red-500 animate-pulse" : "text-gray-400")} />
                <span className={cn("font-mono text-2xl font-bold", questionTimeLeft < 10 ? "text-red-500" : "text-gray-800")}>
                  {formatTime(questionTimeLeft)}
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Question Card */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white p-6 md:p-8 border border-gray-200 shadow-lg rounded-xl relative"
            >
              {/* Progress Bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 rounded-t-xl overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-black"
                />
              </div>

              {/* Question Header */}
              <div className="mb-6 flex justify-between items-start gap-6">
                <div className="flex-grow">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-gray-400 text-sm font-bold tracking-widest">
                      QUESTION {currentQuestionIndex + 1} / {questions.length}
                    </span>
                    {isMultipleAnswer && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                        Multiple answers allowed
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-black leading-tight">
                    {currentQuestion.question}
                  </h3>
                </div>

                {/* Submit/Next Button */}
                {currentQuestionIndex === questions.length - 1 ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 font-bold text-sm shadow-lg transition-all whitespace-nowrap rounded-lg",
                      isSubmitting 
                        ? "bg-gray-400 cursor-not-allowed" 
                        : "bg-black text-white hover:bg-gray-800"
                    )}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin">⌛</span>
                        Saving to Sheets...
                      </>
                    ) : (
                      <>
                        Submit Test
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-3 bg-black text-white font-bold text-sm shadow-lg hover:bg-gray-800 transition-all whitespace-nowrap rounded-lg"
                  >
                    Next Question
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {Object.entries(currentQuestion.options).map(([key, option], index) => (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    key={key}
                    onClick={() => handleOptionSelect(key)}
                    disabled={isSubmitting}
                    className={cn(
                      "group relative flex items-center p-4 border-2 transition-all duration-300 text-left overflow-hidden rounded-lg",
                      isOptionSelected(currentQuestion.id, key)
                        ? "bg-black border-black text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50",
                      isSubmitting && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "w-10 h-10 flex items-center justify-center border-2 mr-4 text-sm font-bold rounded-lg transition-all",
                      isOptionSelected(currentQuestion.id, key)
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-gray-100 border-gray-200 text-gray-500 group-hover:border-gray-400"
                    )}>
                      {key.toUpperCase()}
                    </span>
                    <span className="font-medium">{option}</span>
                    
                    {/* Show checkmark for selected multiple answers */}
                    {isMultipleAnswer && isOptionSelected(currentQuestion.id, key) && (
                      <CheckCircle className="w-5 h-5 ml-auto text-white/80" />
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Footer with Navigation and Violations */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="w-20"></div>

                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    violations > 0 ? "bg-red-500 animate-pulse" : "bg-gray-300"
                  )} />
                  <span className={cn(
                    "text-xs font-bold tracking-wider",
                    violations > 0 ? "text-red-500" : "text-gray-400"
                  )}>
                    SECURITY: {violations}/3
                  </span>
                </div>

                <div className="w-20"></div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};