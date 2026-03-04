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
  BarChart,
  LogOut
} from 'lucide-react';
import { Question, UserData, QuestionsData } from '../types';
import { cn } from '../utils';
import questionsRaw from '../questions.json';

const questionsData = questionsRaw as unknown as QuestionsData;

interface AptitudeTestProps {
  user: UserData;
  onComplete: (score: number, total: number, questions: Question[], answers: Record<number, string[]>, timeTaken: number) => void;
  onExit: () => void;
}

export const AptitudeTest: React.FC<AptitudeTestProps> = ({ user, onComplete, onExit }) => {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const [selectedSetIndex] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      if (parsed.selectedSetIndex !== undefined) {
        return parsed.selectedSetIndex;
      }
    }
    return Math.floor(Math.random() * questionsData.sets.length);
  });
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.currentQuestionIndex || 0;
    }
    return 0;
  });
  
  const [answers, setAnswers] = useState<Record<number, string[]>>(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.answers || {};
    }
    return {};
  });
  
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      if (parsed.startTime) {
        const elapsedSeconds = Math.floor((Date.now() - parsed.startTime) / 1000);
        const remaining = Math.max(30 * 60 - elapsedSeconds, 0);
        return remaining;
      }
      return parsed.timeLeft || 30 * 60;
    }
    return 30 * 60;
  });
  
  const [questionTimeLeft, setQuestionTimeLeft] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.questionTimeLeft || 0;
    }
    return 0;
  });
  
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [violations, setViolations] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.violations || 0;
    }
    return 0;
  });
  
  const [hasStarted, setHasStarted] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.hasStarted || false;
    }
    return false;
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkToast, setNetworkToast] = useState<{ show: boolean; message: string; type: 'online' | 'offline' } | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [startTime] = useState(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return parsed.startTime || Date.now();
    }
    return Date.now();
  });
  
  // Answer statistics
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [skippedQuestions, setSkippedQuestions] = useState(0);
  const [partialCorrectAnswers, setPartialCorrectAnswers] = useState(0);
  
  // Refs
  const lastViolationTime = useRef(0);
  const isAway = useRef(false);
  const submissionStarted = useRef(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const questionTimerRef = useRef<NodeJS.Timeout>();
  
  // ============================================
  // SECURITY ALERT STATE
  // ============================================
  const [securityAlert, setSecurityAlert] = useState<{ 
    show: boolean; 
    message: string; 
    count: number; 
    isInitial?: boolean 
  } | null>(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      if (parsed.hasStarted) {
        return null;
      }
    }
    return {
      show: true,
      isInitial: true,
      count: 0,
      message: "Warning: Do not minimize the window, switch tabs, or refresh the page during the test. This is violation 0 out of 3. If you do this 3 times, the test will be submitted automatically. Please keep the test in full screen."
    };
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

  const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyPdPt3FNO-rmFl2RHdzDnptN1qXFCBHAJAgWOBqPmWDyVid-wG5E3kEA9BXyrd-_Vv/exec';

  // ============================================
  // ENHANCED PAGE REFRESH PREVENTION
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;

    // Prevent browser refresh/reload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveTestState();
      e.preventDefault();
      e.returnValue = 'WARNING: Refreshing will count as a security violation and may auto-submit your test!';
      return 'WARNING: Refreshing will count as a security violation and may auto-submit your test!';
    };

    // Block keyboard shortcuts for refresh
    const handleKeyDown = (e: KeyboardEvent) => {
      const isRefreshKey = 
        e.key === 'F5' || 
        (e.ctrlKey && e.key === 'r') || 
        (e.metaKey && e.key === 'r') ||
        (e.ctrlKey && e.key === 'R') ||
        (e.metaKey && e.key === 'R') ||
        (e.ctrlKey && e.key === 'f5') ||
        (e.ctrlKey && e.shiftKey && e.key === 'r');

      if (isRefreshKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // Show custom alert
        setSecurityAlert({ 
          show: true, 
          message: `⚠️ REFRESH ATTEMPT DETECTED!\n\nYou attempted to refresh the page. This is security violation ${violations + 1}/3.\n\nIf you reach 3 violations, your test will be automatically submitted.`,
          count: violations + 1
        });
        
        // Count as violation
        setViolations(prev => {
          const newCount = prev + 1;
          
          if (newCount >= 3) {
            setTimeout(() => handleSubmit(true), 3000);
          }
          
          return newCount;
        });
        
        saveTestState();
        return false;
      }
    };

    // Disable right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [hasStarted, isSubmitted, violations]);

  // ============================================
  // PREVENT BROWSER BACK/FORWARD NAVIGATION
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;

    // Push a dummy state to prevent back navigation
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = (e: PopStateEvent) => {
      // Push state again to prevent navigation
      window.history.pushState(null, '', window.location.href);
      
      // Count as violation
      setViolations(prev => {
        const newCount = prev + 1;
        
        setSecurityAlert({ 
          show: true, 
          message: `Security Violation ${newCount}/3: Browser navigation detected. Please stay on this page.`,
          count: newCount
        });
        
        if (newCount >= 3) {
          setTimeout(() => handleSubmit(true), 3000);
        }
        
        return newCount;
      });
      
      saveTestState();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasStarted, isSubmitted]);

  // ============================================
  // DETECT PAGE REFRESH ON MOUNT
  // ============================================
  useEffect(() => {
    const navigationEntries = performance.getEntriesByType('navigation');
    const isReload = navigationEntries.length > 0 && (navigationEntries[0] as PerformanceNavigationTiming).type === 'reload';
    
    if (isReload) {
      const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        // Only count as violation if the test was already in progress
        if (parsed.hasStarted && !parsed.isSubmitted) {
          const newCount = (parsed.violations || 0) + 1;
          setViolations(newCount);
          
          if (newCount >= 3) {
            setSecurityAlert({ 
              show: true, 
              message: `⚠️ MAXIMUM VIOLATIONS REACHED\n\nPage refresh detected. This is violation 3/3. Your test is being submitted automatically.`,
              count: 3
            });
            // Give them a moment to see the message before submitting
            setTimeout(() => handleSubmit(true), 3000);
          } else {
            setSecurityAlert({ 
              show: true, 
              message: `⚠️ SECURITY VIOLATION ${newCount}/3\n\nPage refresh detected. Please do not refresh the page during the test.`,
              count: newCount
            });
          }
          
          // Update the saved state immediately
          localStorage.setItem(`aptitude_test_${user.rollNumber}`, JSON.stringify({
            ...parsed,
            violations: newCount
          }));
        }
      }
    }
  }, []);

  // ============================================
  // SAVE TEST STATE TO LOCALSTORAGE
  // ============================================
  const saveTestState = useCallback(() => {
    if (isSubmitted) return;
    
    const state = {
      selectedSetIndex,
      currentQuestionIndex,
      answers,
      timeLeft,
      questionTimeLeft,
      violations,
      hasStarted,
      startTime,
      lastSaved: Date.now()
    };
    
    localStorage.setItem(`aptitude_test_${user.rollNumber}`, JSON.stringify(state));
    console.log('💾 Test state saved');
  }, [selectedSetIndex, currentQuestionIndex, answers, timeLeft, questionTimeLeft, violations, hasStarted, startTime, user.rollNumber, isSubmitted]);

  // ============================================
  // AUTO-SAVE EVERY 30 SECONDS
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;
    
    const autoSaveInterval = setInterval(() => {
      saveTestState();
    }, 30000);
    
    return () => clearInterval(autoSaveInterval);
  }, [hasStarted, isSubmitted, saveTestState]);

  // ============================================
  // REACTIVE SAVE FOR CRITICAL STATE CHANGES
  // ============================================
  useEffect(() => {
    if (hasStarted && !isSubmitted) {
      saveTestState();
    }
  }, [currentQuestionIndex, answers, violations, hasStarted, isSubmitted, saveTestState]);

  // ============================================
  // ONLINE STATUS MONITOR
  // ============================================
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkToast({
        show: true,
        message: "Network restored. You can continue your test.",
        type: 'online'
      });
      console.log('📶 Device is online');
      syncFailedSubmissions();
      
      setTimeout(() => setNetworkToast(null), 4000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setNetworkToast({
        show: true,
        message: "Network lost. Progress is being saved locally.",
        type: 'offline'
      });
      console.log('📶 Device is offline');
      
      setTimeout(() => setNetworkToast(null), 4000);
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

    const fetchWithTimeout = async (url: string, options: any, timeout = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      } catch (error) {
        clearTimeout(id);
        throw error;
      }
    };

    // METHOD 1: Try fetch with JSON
    try {
      const response = await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          setSubmissionId(result.submissionId || null);
          return true;
        }
      }
    } catch (jsonError) {
      console.log('JSON fetch failed or timed out:', jsonError);
    }

    // METHOD 2: Try with FormData (often works better with Apps Script)
    try {
      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));

      const response = await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          setSubmissionId(result.submissionId || null);
          return true;
        }
      }
    } catch (formError) {
      console.log('FormData failed or timed out:', formError);
    }

    // METHOD 3: Try with no-cors mode (last resort, won't get response but request might hit)
    try {
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      }, 5000);
      
      console.log('✅ Request sent with no-cors mode');
      return true;
      
    } catch (noCorsError) {
      console.error('❌ All submission methods failed:', noCorsError);
      return false;
    }
  };

  // ============================================
  // CHECK IF ANSWER IS CORRECT
  // ============================================
  const isAnswerCorrect = (question: Question, userAnswer: string[]): boolean => {
    const correctAnswer = question.answer;
    
    if (!userAnswer || userAnswer.length === 0) return false;
    
    if (typeof correctAnswer === 'string') {
      return userAnswer.length === 1 && userAnswer[0] === correctAnswer;
    }
    
    if (Array.isArray(correctAnswer)) {
      const sortedUserAnswer = [...userAnswer].sort();
      const sortedCorrectAnswer = [...correctAnswer].sort();
      
      return sortedUserAnswer.length === sortedCorrectAnswer.length &&
             sortedUserAnswer.every((value, index) => value === sortedCorrectAnswer[index]);
    }
    
    return false;
  };

  // ============================================
  // CHECK IF ANSWER IS PARTIALLY CORRECT
  // ============================================
  const isAnswerPartiallyCorrect = (question: Question, userAnswer: string[]): boolean => {
    const correctAnswer = question.answer;
    
    if (!userAnswer || userAnswer.length === 0) return false;
    if (!Array.isArray(correctAnswer)) return false;
    
    const isFullyCorrect = isAnswerCorrect(question, userAnswer);
    if (isFullyCorrect) return false;
    
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
        skippedCount++;
        skippedQuestionIds.push(q.id.toString());
      } else if (isAnswerCorrect(q, userAnswer)) {
        correctCount++;
        correctAnswerIds.push(q.id.toString());
      } else if (isAnswerPartiallyCorrect(q, userAnswer)) {
        partialCount++;
        partialAnswerIds.push(q.id.toString());
      } else {
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
  const handleSubmit = async (isDisqualified = false) => {
    if (isSubmitted || isSubmitting || submissionStarted.current) {
      console.log('Submission already in progress');
      return;
    }
    
    submissionStarted.current = true;
    setIsSubmitted(true);
    setIsSubmitting(true);
    setSubmitStatus('saving');
    setSubmitMessage(isDisqualified ? 'Security Breach Detected. Finalizing submission...' : 'Saving your results...');

    console.log('🎯 Starting final submission...', isDisqualified ? '(Disqualified)' : '');
    
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    
    const counts = getAnswerCounts();
    
    setCorrectAnswers(counts.correctCount);
    setWrongAnswers(counts.wrongCount);
    setSkippedQuestions(counts.skippedCount);
    setPartialCorrectAnswers(counts.partialCount);
    
    const totalQuestions = questions.length;
    const score = counts.correctCount;
    const timeTaken = (30 * 60) - timeLeft;
    const percentage = ((score / totalQuestions) * 100).toFixed(2);
    
    const payload = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      rollNumber: user.rollNumber,
      
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
      
      answers: answers,
      correctAnswerIds: counts.correctAnswerIds,
      partialAnswerIds: counts.partialAnswerIds,
      wrongAnswerIds: counts.wrongAnswerIds,
      skippedQuestionIds: counts.skippedQuestionIds,
      
      violations: violations + (isDisqualified ? 1 : 0),
      disqualified: isDisqualified,
      browserInfo: getBrowserInfo(),
      userAgent: navigator.userAgent
    };

    // Attempt cloud submission with a faster timeout strategy
    const cloudSuccess = await submitToGoogleSheets(payload);
    
    if (cloudSuccess) {
      setSubmitStatus('success');
      setSubmitMessage(`✓ Results saved successfully!`);
    } else {
      setSubmitStatus('error');
      setSubmitMessage(isOnline ? '⚠️ Submission failed. Saved locally.' : '📴 Offline. Saved locally.');
    }

    // Save to local history regardless of cloud success
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
      synced: cloudSuccess,
      disqualified: isDisqualified
    });
    localStorage.setItem('aptitude_results', JSON.stringify(results));

    if (!cloudSuccess) {
      const failed = JSON.parse(localStorage.getItem('aptitude_failed') || '[]');
      failed.push(payload);
      localStorage.setItem('aptitude_failed', JSON.stringify(failed));
    }
    
    // Clear active test state
    localStorage.removeItem(`aptitude_test_${user.rollNumber}`);
    
    // Short delay to show success/error status before navigating
    setTimeout(() => {
      if (isDisqualified) {
        onExit();
      } else {
        onComplete(score, totalQuestions, questions, answers, timeTaken);
      }
      
      // Cleanup submission state
      setIsSubmitting(false);
      submissionStarted.current = false;
    }, 1500);
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
          setTimeout(() => handleSubmit(true), 3000);
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
      
      saveTestState();
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
  }, [isSubmitted, hasStarted, saveTestState]);

  // ============================================
  // MAIN TIMER EFFECT
  // ============================================
  useEffect(() => {
    if (!hasStarted || isSubmitted) return;

    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        const newTime = prev - 1;
        if (newTime % 60 === 0) {
          saveTestState();
        }
        return newTime;
      });
    }, 1000);

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prevIndex => prevIndex + 1);
            saveTestState();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [timeLeft, hasStarted, isSubmitted, currentQuestionIndex, questions.length, saveTestState]);

  // ============================================
  // RESTORE TEST STATE ON MOUNT
  // ============================================
  useEffect(() => {
    const savedState = localStorage.getItem(`aptitude_test_${user.rollNumber}`);
    if (savedState && !hasStarted) {
      const parsed = JSON.parse(savedState);
      if (parsed.isSubmitted) {
        setIsSubmitted(true);
      }
    }
  }, [user.rollNumber, hasStarted]);

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
      let newAnswers;
      
      if (isMultipleAnswer) {
        if (currentAnswers.includes(optionKey)) {
          newAnswers = {
            ...prev,
            [currentQ.id]: currentAnswers.filter(k => k !== optionKey)
          };
        } else {
          newAnswers = {
            ...prev,
            [currentQ.id]: [...currentAnswers, optionKey]
          };
        }
      } else {
        newAnswers = {
          ...prev,
          [currentQ.id]: [optionKey]
        };
      }
      
      localStorage.setItem(`aptitude_test_${user.rollNumber}`, JSON.stringify({
        selectedSetIndex,
        currentQuestionIndex,
        answers: newAnswers,
        timeLeft,
        questionTimeLeft,
        violations,
        hasStarted,
        startTime,
        lastSaved: Date.now()
      }));
      
      return newAnswers;
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
      {/* NETWORK TOAST */}
      {/* ======================================== */}
      <AnimatePresence>
        {networkToast?.show && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={cn(
              "fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full shadow-lg flex items-center gap-3 border",
              networkToast.type === 'online' 
                ? "bg-green-500 text-white border-green-600" 
                : "bg-red-500 text-white border-red-600"
            )}
          >
            {networkToast.type === 'online' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="font-bold text-sm tracking-tight">{networkToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================== */}
      {/* STATUS BAR */}
      {/* ======================================== */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 py-2 bg-white border-b border-gray-200 text-xs shadow-sm">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors duration-300",
            isOnline ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          )}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="font-medium">Online</span>
          </div>
          
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
              
              <p className="text-gray-700 mb-8 whitespace-pre-line">
                {securityAlert.message}
              </p>
              
              {securityAlert.count < 3 && (
                <button
                  onClick={() => {
                    setSecurityAlert(null);
                    if (securityAlert.isInitial) {
                      lastViolationTime.current = Date.now();
                      setHasStarted(true);
                      saveTestState();
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
                  <h3 className="text-2xl font-bold mb-3">Thanks for Submitting!</h3>
                  <p className="text-gray-700 mb-6">{submitMessage}</p>
                  
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
                    onClick={onExit}
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
                    onClick={() => handleSubmit()}
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
                    onClick={() => {
                      setCurrentQuestionIndex((prev) => prev + 1);
                    }}
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