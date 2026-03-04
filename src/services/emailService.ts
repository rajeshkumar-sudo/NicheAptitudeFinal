import emailjs from '@emailjs/browser';
import { UserData } from '../types';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_gqu9p9s';
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_e8m6jyz';
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'BmWc-bm3Eh3cG5Baj';

export const sendTestResults = async (user: UserData, score: number, total: number) => {
  const templateParams = {
    fullname: user.name,
    college_id: user.rollNumber,
    email: user.email,
    phone: user.phone,
    marks: `${score} / ${total}`,
    time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  };

  try {
    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      PUBLIC_KEY
    );
    console.log('Email sent successfully!', response.status, response.text);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};
