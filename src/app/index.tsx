import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/lib/auth';

export default function Entry() {
  const { session } = useAuth();

  // Jeszcze sprawdzamy zapisaną sesję — nie migamy ekranem logowania.
  if (session === undefined) return <Loading />;

  return <Redirect href={session ? '/(app)' : '/(auth)/login'} />;
}
