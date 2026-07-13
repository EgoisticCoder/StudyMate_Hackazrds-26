import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface SignupDraftContextType {
  email: string;
  password: string;
  setEmail: (e: string) => void;
  setPassword: (p: string) => void;
  clear: () => void;
}

const SignupDraftContext = createContext<SignupDraftContextType | undefined>(undefined);

export function SignupDraftProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const clear = useCallback(() => {
    setEmail('');
    setPassword('');
  }, []);

  return (
    <SignupDraftContext.Provider
      value={{ email, password, setEmail, setPassword, clear }}
    >
      {children}
    </SignupDraftContext.Provider>
  );
}

export function useSignupDraft() {
  const ctx = useContext(SignupDraftContext);
  if (!ctx) {
    throw new Error('useSignupDraft must be used within SignupDraftProvider');
  }
  return ctx;
}
