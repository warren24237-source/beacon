import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { normaliseNumber } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/lib/ui';

// Shown once to people who joined before numbers were required.
export default function AddPhone() {
  const { refreshProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const number = normaliseNumber(phone);
    if (!number) return setError('That number does not look right. Try e.g. 07700 900123.');
    setBusy(true);
    const { error } = await supabase.rpc('set_phone_number', { p_phone_number: number });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <Screen>
      <Title>Add your mobile number</Title>
      <Body muted>So friends can message or call you. Only friends you add on Beacon can see it.</Body>
      <Field value={phone} onChangeText={setPhone} placeholder="e.g. 07700 900123" keyboardType="phone-pad" autoComplete="tel" />
      <ErrorText>{error}</ErrorText>
      <Button label="Save" onPress={save} busy={busy} />
    </Screen>
  );
}
