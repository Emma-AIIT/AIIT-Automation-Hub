/**
 * NumbersInput - Recipient list for the Broadcast Exchange HQ account.
 * Numbers can be typed or pasted, or imported from a CSV or Excel file, which adds
 * them to the box so they can be checked before sending. Reports the cleaned list to
 * the page through onChange. Files are read in the browser and never uploaded.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { numbersFromRows, parsePhoneNumbers } from '@/lib/phone-numbers';

interface NumbersInputProps {
  text: string;
  onTextChange: (text: string) => void;
  maxNumbers: number;
}

async function readRows(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded on demand so the Broadcast page doesn't carry the Excel parser
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    return rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell))));
  }
  const text = await file.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.split(',').map((cell) => cell.replace(/^\s*"|"\s*$/g, '')));
}

export function NumbersInput({ text, onTextChange, maxNumbers }: NumbersInputProps) {
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parsePhoneNumbers(text), [text]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;

    setIsImporting(true);
    try {
      const { numbers, invalid } = numbersFromRows(await readRows(file));
      if (numbers.length === 0) {
        toast.error(`No phone numbers found in "${file.name}"`);
        return;
      }
      onTextChange([text.trim(), ...numbers, ...invalid].filter(Boolean).join('\n'));
      toast.success(`Imported ${numbers.length} number${numbers.length !== 1 ? 's' : ''} from "${file.name}"`);
    } catch (err) {
      console.error('Number import failed:', err);
      toast.error(`Could not read "${file.name}". Use a .csv or .xlsx file.`);
    } finally {
      setIsImporting(false);
    }
  };

  const overLimit = parsed.numbers.length > maxNumbers;

  return (
    <div className="flex flex-col gap-3 h-full">
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={'One number per line, or separated by commas\n0412 345 678\n+61 498 765 432'}
        aria-label="Phone numbers"
        className="flex-1 min-h-0 w-full resize-none rounded-lg border border-(--color-border-default) bg-white px-4 py-3 text-sm text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/10 transition leading-relaxed"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-(--color-text-muted)">
          <span className="font-medium text-(--color-text-primary)">
            {parsed.numbers.length} number{parsed.numbers.length !== 1 ? 's' : ''}
          </span>
          {parsed.duplicates > 0 && `, ${parsed.duplicates} duplicate${parsed.duplicates !== 1 ? 's' : ''} removed`}
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isImporting}
          className="min-h-[44px] shrink-0 px-3 text-sm font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isImporting ? 'Importing...' : 'Import CSV or Excel'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={(e) => void handleFile(e)} className="hidden" />
      </div>

      {overLimit && (
        <p className="text-xs text-red-500">
          Only {maxNumbers} numbers can go in one broadcast. Remove {parsed.numbers.length - maxNumbers} to continue.
        </p>
      )}
      {parsed.invalid.length > 0 && (
        <p className="text-xs text-amber-600 break-words">
          {parsed.invalid.length} won&apos;t be sent: {parsed.invalid.slice(0, 5).join(', ')}
          {parsed.invalid.length > 5 ? '…' : ''}
        </p>
      )}
    </div>
  );
}
