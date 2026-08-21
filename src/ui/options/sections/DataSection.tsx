import { useRef } from 'react';
import { sendMessage } from '@/background/messages';
import { clearAll, readState, updateState } from '@/storage/repo';
import { migrate } from '@/storage/schema';
import { DownloadIcon, TrashIcon, UploadIcon } from '../../icons';
import type { SectionProps } from './types';

interface Props extends SectionProps {
  /** Called when stored state is replaced wholesale, so the host can re-seed its inputs. */
  onReplaced: () => void;
}

export function DataSection({ state, flash, onReplaced }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const custom = state.settings.custom;

  const exportJson = async () => {
    const blob = new Blob([JSON.stringify(await readState(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coding-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    /*
     * An import replaces state wholesale, so it destroys any custom platform the file
     * does not contain — along with counts that were typed by hand and cannot be
     * fetched back from anywhere. Only asks when there is something to lose.
     */
    if (custom.length) {
      const names = custom.map((def) => def.displayName).join(', ');
      const ok = window.confirm(
        `Importing replaces everything stored, including your own platforms ` +
          `(${names}) and their hand-kept counts, unless the file contains them ` +
          `too.\n\nContinue?`,
      );
      if (!ok) return;
    }

    try {
      // migrate() is exactly the validation an import needs: it accepts any shape,
      // keeps what it recognises, and drops the rest.
      const imported = migrate(JSON.parse(await file.text()));
      await updateState(() => imported);
      onReplaced();
      await sendMessage({ type: 'reschedule' });
      flash('Imported');
    } catch {
      flash('That file could not be read as a tracker backup.');
    }
  };

  const reset = async () => {
    const kept = custom.length
      ? `\n\nThat includes your own platforms (${custom
          .map((def) => def.displayName)
          .join(', ')}) and their hand-kept counts, which cannot be fetched again.`
      : '';

    if (
      !window.confirm(
        `Delete every username, snapshot and history point? This cannot be undone.${kept}`,
      )
    ) {
      return;
    }

    await clearAll();
    onReplaced();
    await sendMessage({ type: 'reschedule' });
    flash('Everything cleared');
  };

  return (
    <>
      <h2>Your data</h2>
      <section className="settings-row">
        <button onClick={() => void exportJson()}>
          <DownloadIcon size={13} /> Export JSON
        </button>
        <button onClick={() => fileInput.current?.click()}>
          <UploadIcon size={13} /> Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importJson(file);
            e.target.value = '';
          }}
        />
        <button className="danger" onClick={() => void reset()}>
          <TrashIcon size={13} /> Delete everything
        </button>
        <span className="muted hint">
          History lives only in this browser profile. Export it before reinstalling.
        </span>
      </section>
    </>
  );
}
