import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Phone, ArrowRight, Hash } from 'lucide-react';
import { UserData } from '../types';
import { cn } from '../utils';

interface RegistrationFormProps {
  onRegister: (data: UserData) => void;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({ onRegister }) => {
  const [formData, setFormData] = useState<UserData>({
    name: '',
    email: '',
    phone: '',
    rollNumber: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!/^[a-zA-Z\s]*$/.test(formData.name)) {
      newErrors.name = 'Full Name should contain only letters';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Please enter a valid name';
    }

    if (!/^\d{10}$/.test(formData.phone)) {
      newErrors.phone = 'Phone number must be exactly 10 digits';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.rollNumber.trim()) {
      newErrors.rollNumber = 'Roll number is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onRegister(formData);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg bg-white p-8 md:p-10 border border-black/10 shadow-2xl relative overflow-hidden"
    >
      <div className="relative z-10 mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-3xl md:text-4xl font-sans font-bold tracking-tight text-black mb-4">
            Registration
          </h2>
          <p className="text-black/40 text-sm font-medium leading-relaxed max-w-xs">
            Enter your professional details to begin the assessment session.
          </p>
        </motion.div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-[9px] font-bold tracking-[0.3em] text-black/30 ml-1">Full Name</label>
            <div className="relative group">
              <input
                required
                type="text"
                placeholder="Required"
                className={cn(
                  "w-full px-1 py-3 bg-transparent border-b border-black/10 focus:outline-none focus:border-black transition-all text-black placeholder:text-black/10 font-medium",
                  errors.name && "border-rose-500 focus:border-rose-500"
                )}
                value={formData.name}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[a-zA-Z\s]*$/.test(val)) {
                    setFormData({ ...formData, name: val });
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }
                }}
              />
            </div>
            {errors.name && <p className="text-[9px] font-bold text-rose-500 tracking-widest ml-1">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold tracking-[0.3em] text-black/30 ml-1">Roll Number</label>
            <div className="relative group">
              <input
                required
                type="text"
                placeholder="Required"
                className={cn(
                  "w-full px-1 py-3 bg-transparent border-b border-black/10 focus:outline-none focus:border-black transition-all text-black placeholder:text-black/10 font-medium",
                  errors.rollNumber && "border-rose-500 focus:border-rose-500"
                )}
                value={formData.rollNumber}
                onChange={(e) => {
                  setFormData({ ...formData, rollNumber: e.target.value });
                  if (errors.rollNumber) setErrors({ ...errors, rollNumber: '' });
                }}
              />
            </div>
            {errors.rollNumber && <p className="text-[9px] font-bold text-rose-500 tracking-widest ml-1">{errors.rollNumber}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold tracking-[0.3em] text-black/30 ml-1">Email Address</label>
            <div className="relative group">
              <input
                required
                type="email"
                placeholder="Required"
                className={cn(
                  "w-full px-1 py-3 bg-transparent border-b border-black/10 focus:outline-none focus:border-black transition-all text-black placeholder:text-black/10 font-medium",
                  errors.email && "border-rose-500 focus:border-rose-500"
                )}
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors({ ...errors, email: '' });
                }}
              />
            </div>
            {errors.email && <p className="text-[9px] font-bold text-rose-500 tracking-widest ml-1">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold tracking-[0.3em] text-black/30 ml-1">Phone Number</label>
            <div className="relative group">
              <input
                required
                type="tel"
                maxLength={10}
                placeholder="Required"
                className={cn(
                  "w-full px-1 py-3 bg-transparent border-b border-black/10 focus:outline-none focus:border-black transition-all text-black placeholder:text-black/10 font-medium",
                  errors.phone && "border-rose-500 focus:border-rose-500"
                )}
                value={formData.phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 10) {
                    setFormData({ ...formData, phone: val });
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }
                }}
              />
            </div>
            {errors.phone && <p className="text-[9px] font-bold text-rose-500 tracking-widest ml-1">{errors.phone}</p>}
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          className="w-full group relative flex items-center justify-center gap-4 py-5 bg-black text-white font-bold tracking-[0.3em] text-[10px] hover:bg-black/90 transition-all mt-6"
        >
          Begin Assessment
          <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
        </motion.button>
      </form>
      
      <div className="mt-10 pt-8 border-t border-black/5 flex items-center justify-between opacity-30">
        <span className="text-[8px] font-bold tracking-[0.2em] text-black">Secure Connection</span>
        <span className="text-[8px] font-bold tracking-[0.2em] text-black">System v4.2.0</span>
      </div>
    </motion.div>
  );
};
