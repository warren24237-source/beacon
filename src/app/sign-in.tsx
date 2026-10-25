import { useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/lib/ui';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('That email doesn\'t look right.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  async function verify() {
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(error.message);
    // On success the auth listener moves us on automatically.
  }

  if (!sent) {
    return (
      <Screen>
        <Title>Beacon</Title>
        <Body muted>Know when your mates are free. Nobody sees your status unless you match.</Body>
        <Field
          value={email}
          onChangeText={setEmail}
          placeholder="Your email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <ErrorText>{error}</ErrorText>
        <Button label="Send me a code" onPress={sendCode} busy={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Check your email</Title>
      <Body muted>We sent a code to {email.trim()}.</Body>
      <Field
        value={code}
        onChangeText={setCode}
        placeholder="Code"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={10}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Sign in" onPress={verify} busy={busy} />
      <Button label="Use a different email" secondary onPress={() => { setSent(false); setCode(''); }} />
    </Screen>
  );
}
