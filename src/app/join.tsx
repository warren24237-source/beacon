import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { normaliseWhatsAppNumber } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/lib/ui';

export default function Join() {
  const { refreshProfile } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    setError('');
    const number = normaliseWhatsAppNumber(phone);
    if (!inviteCode.trim()) return setError('You need the invite code from the group.');
    if (!name.trim()) return setError('Add your name so friends know who you are.');
    if (!number) return setError('That WhatsApp number doesn\'t look right.');

    setBusy(true);
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        setBusy(false);
        return setError(authError.message);
      }
    }
    const { error } = await supabase.rpc('join_group', {
      p_invite_code: inviteCode.trim(),
      p_full_name: name.trim(),
      p_phone_number: number,
    });
    if (error) {
      setBusy(false);
      return setError(error.message.includes('invite') ? 'That invite code isn\'t right.' : error.message);
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <Screen>
      <Title>Beacon</Title>
      <Body muted>Know when your mates are free. Nobody sees your status unless you match. Your number is only used to open WhatsApp.</Body>
      <Field value={inviteCode} onChangeText={setInviteCode} placeholder="Invite code" autoCapitalize="none" />
      <Field value={name} onChangeText={setName} placeholder="Your first name" autoComplete="given-name" />
      <Field
        value={phone}
        onChangeText={setPhone}
        placeholder="WhatsApp number, e.g. 07700 900123"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Join" onPress={join} busy={busy} />
    </Screen>
  );
}
