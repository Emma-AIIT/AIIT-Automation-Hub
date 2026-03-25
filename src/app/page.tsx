/**
 * Root page — immediately redirects to /automations.
 * Acts as the entry point so the app always lands on the main dashboard.
 */
/**
 * Root page of the app — immediately redirects visitors to /automations.
 * Acts as a simple entry point so the root URL always lands on the main dashboard.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/automations');
}
