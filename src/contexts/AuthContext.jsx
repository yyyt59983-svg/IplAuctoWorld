import React, { createContext, useContext, useEffect, useState } from 'react';

import { auth } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInAnonymously,
  updateProfile
} from 'firebase/auth';

const AuthContext = createContext({
  user: null,
  loading: true,
  loginWithGoogle: async () => { },
  loginAsGuest: async () => { },
  logout: async () => { }
});

const googleProvider = new GoogleAuthProvider();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // AuthProvider check failed
  }
  return context || {};
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let savedGuest = null;
    try {
      const stored = localStorage.getItem('crickauction_guest_user');
      if (stored) savedGuest = JSON.parse(stored);
    } catch (_) {}

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else if (savedGuest) {
        setUser(savedGuest);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  };

  const loginAsGuest = async (displayName) => {
    try {
      const result = await signInAnonymously(auth);
      await updateProfile(result.user, { displayName });
      const fullUser = { ...result.user, displayName };
      setUser(fullUser);
      return fullUser;
    } catch (err) {
      console.warn('Firebase anonymous auth unavailable, using offline/local guest session:', err);
      let guestId = null;
      try {
        guestId = localStorage.getItem('crickauction_guest_uid');
      } catch (_) {}

      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
        try {
          localStorage.setItem('crickauction_guest_uid', guestId);
        } catch (_) {}
      }

      const localGuest = {
        uid: guestId,
        displayName: displayName || 'Guest Manager',
        isAnonymous: true,
        email: null,
        photoURL: null,
      };

      try {
        localStorage.setItem('crickauction_guest_user', JSON.stringify(localGuest));
      } catch (_) {}

      setUser(localGuest);
      return localGuest;
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('crickauction_guest_user');
    } catch (_) {}
    setUser(null);
    try {
      await signOut(auth);
    } catch (_) {}
  };

  const value = {
    user,
    loading,
    loginWithGoogle,
    loginAsGuest,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
