import { useState } from 'react';
import { supabase } from '../lib/supabase';

const REASONS = [
  'Missing key points',
  'Contains errors',
  'Too vague',
  'Too technical',
  'Wrong information',
];

export default function FeedbackWidget({ paperId, userId }) {
  const [showReasons, setShowReasons] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitRating(r, reason = null) {
    await supabase.from('feedback').insert({
      user_id: userId,
      paper_id: paperId,
      rating: r,
      reason: reason,
    });
    setSubmitted(true);
    setShowReasons(false);
  }

  if (submitted) {
    return (
      <div style={{
        fontSize: 12, color: 'var(--muted)', padding: '6px 0',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>✓</span>
        <span>Thanks for your feedback</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Was this summary helpful?
        </span>
        <button
          onClick={() => submitRating('positive')}
          style={{
            background: 'transparent', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
          }}
        >
          👍
        </button>
        <button
          onClick={() => setShowReasons(true)}
          style={{
            background: 'transparent', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
          }}
        >
          👎
        </button>
      </div>

      {showReasons && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', width: '100%', marginBottom: 4 }}>
            What was wrong?
          </div>
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => submitRating('negative', r)}
              style={{
                padding: '4px 10px', borderRadius: 12,
                border: '0.5px solid var(--border)',
                background: 'transparent', fontSize: 11,
                cursor: 'pointer', color: 'var(--text)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
