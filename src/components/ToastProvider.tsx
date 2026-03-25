/**
 * ToastProvider
 * Renders the react-hot-toast Toaster in the top-right corner.
 * Mount once at the app root so toast notifications are available globally.
 */
'use client';

import { Toaster } from 'react-hot-toast';

export function ToastProvider() {
  return <Toaster position="top-right" />;
}
