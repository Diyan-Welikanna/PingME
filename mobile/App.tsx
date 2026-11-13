import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, BackHandler, Easing, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { avatarData } from './avatarData';

type Tab = 'home' | 'circle' | 'settings';
type AvatarId = `avatar_${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'}`;
type Person = { id: string; name: string; initials: string; color: string; avatarId?: AvatarId; latitude: number; longitude: number; place: string; updated: string; locationSharingEnabled: boolean; isUser?: boolean };
type User = { id: string; username: string; email: string; name: string; avatarId: AvatarId; locationSharingEnabled?: boolean };
type ApiLocation = { userId: string; username?: string; name: string; avatarId?: AvatarId; latitude: number; longitude: number; updatedAt: string; locationSharingEnabled?: boolean | number | string };
type FriendRequest = { id: string; status: string; senderId: string; senderUsername: string; senderName: string; senderAvatarId?: AvatarId; receiverId: string; receiverUsername: string; receiverName: string; receiverAvatarId?: AvatarId; createdAt?: string; respondedAt?: string | null };
type Coordinates = { latitude: number; longitude: number };
const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.diyan.co.uk/pingme').replace(/\/$/, '');
const colors = ['#E5684A', '#176B87', '#C08B45', '#7B6B9E'];
const BACKGROUND_LOCATION_TASK = 'pingme-background-location';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const avatarImages: Record<AvatarId, number> = {
  avatar_01: require('./assets/avatars/avatar_01.png'),
  avatar_02: require('./assets/avatars/avatar_02.png'),
  avatar_03: require('./assets/avatars/avatar_03.png'),
  avatar_04: require('./assets/avatars/avatar_04.png'),
  avatar_05: require('./assets/avatars/avatar_05.png'),
  avatar_06: require('./assets/avatars/avatar_06.png'),
  avatar_07: require('./assets/avatars/avatar_07.png'),
  avatar_08: require('./assets/avatars/avatar_08.png'),
  avatar_09: require('./assets/avatars/avatar_09.png'),
  avatar_10: require('./assets/avatars/avatar_10.png'),
};
const avatarIds = Object.keys(avatarImages) as AvatarId[];
let cachedApiUrl: string | null = null;

function requestErrorMessage(path: string, status: number, body: { message?: string }) {
  if ((path === '/auth/login' || path === '/auth/register') && status === 401) return 'Username or password is incorrect.';
  if (path === '/auth/register' && status === 409) return 'Email or username already exists.';
  if (path === '/me/profile' && status === 409) return 'Email or username already exists.';
  if (path === '/me/profile' && status === 400) return body.message || 'Please check your profile details.';
  if (path === '/me/password' && status === 401) return 'Current password is invalid.';
  if (path === '/me/password' && status === 400 && body.message?.includes('confirmation')) return 'New password must match the confirmation password.';
  return GENERIC_ERROR;
}

function avatarUri(avatarId?: AvatarId) {
  return avatarId ? avatarData[avatarId] : '';
}

function normalizeApiUrl(url: string) {
  return url.trim().replace(/\/$/, '');
}

async function getApiUrl() {
  if (cachedApiUrl) return cachedApiUrl;
  cachedApiUrl = normalizeApiUrl(DEFAULT_API_URL);
  return cachedApiUrl;
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const apiUrl = await getApiUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const headers: Record<string, string> = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.headers) Object.assign(headers, options.headers);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers, signal: controller.signal });
  } catch {
    throw new Error(GENERIC_ERROR);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: { message?: string } & T;
  try {
    body = text ? JSON.parse(text) : ({} as { message?: string } & T);
  } catch {
    throw new Error(GENERIC_ERROR);
  }
  if (!response.ok) throw new Error(requestErrorMessage(path, response.status, body));
  return body as T;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('PingMe background location task failed', error);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations && locations.length > 0 ? locations[locations.length - 1] : undefined;
  const token = await AsyncStorage.getItem('pingme-token');
  const sharing = await AsyncStorage.getItem('pingme-location-sharing');
  if (!latest || !token || sharing !== 'true') return;

  try {
    await apiRequest('/locations', {
      method: 'POST',
      body: JSON.stringify({
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
      }),
    }, token);
  } catch (taskError) {
    console.error('PingMe could not publish a background location', taskError);
  }
});

async function requestLocationPermissions() {
  let foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    foreground = await Location.requestForegroundPermissionsAsync();
  }
  if (foreground.status !== 'granted') return false;

  let background = await Location.getBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    background = await Location.requestBackgroundPermissionsAsync();
  }
  return background.status === 'granted';
}

async function startBackgroundLocationTracking() {
  const permissionsGranted = await requestLocationPermissions();
  if (!permissionsGranted) return false;

  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (!registered) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'PingMe location sharing',
        notificationBody: 'Your location is being shared with your trusted circle.',
        notificationColor: '#FFFFFF',
      },
    });
  }
  return true;
}

async function stopBackgroundLocationTracking() {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

function mapPeople(locations: ApiLocation[] = [], userId: string): Person[] {
  return locations.flatMap((location, index) => {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const name = typeof location.name === 'string' && location.name.trim() ? location.name.trim() : 'PingMe user';
    const updatedAt = new Date(location.updatedAt);
    if (!location.userId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
    const isUser = location.userId === userId;
    const isSharing = location.locationSharingEnabled !== false && location.locationSharingEnabled !== 0 && location.locationSharingEnabled !== '0';
    return [{ id: location.userId, name: isUser ? 'You' : name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], avatarId: location.avatarId, latitude, longitude, place: 'Shared location', updated: isUser || isSharing || Number.isNaN(updatedAt.getTime()) ? 'Live now' : updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }), locationSharingEnabled: isSharing, isUser }];
  });
}

function distanceInMeters(from: Coordinates, to: Coordinates) {
  const earthRadius = 6371000;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const latitude = from.latitude * Math.PI / 180;
  const targetLatitude = to.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitude) * Math.cos(targetLatitude);
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function statusColor(status: string): string {
  switch (status) {
    case 'accepted':
      return '#4BA67A';
    case 'declined':
      return '#D0533A';
    default:
      return '#C08B45';
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
}

function greetingLabel() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function mapHtml(people: Person[], center: Coordinates, selectedPersonId: string | null) {
  const points = JSON.stringify([...people].sort((a, b) => Number(b.id === selectedPersonId) - Number(a.id === selectedPersonId)).map((person) => ({
    latitude: person.latitude,
    longitude: person.longitude,
    title: person.isUser ? 'You' : person.name,
    color: person.color,
    avatarUrl: avatarUri(person.avatarId),
    selected: person.id === selectedPersonId,
  }))).replace(/</g, '\\u003c');
  const centerJson = JSON.stringify(center);

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    .leaflet-top.leaflet-left { top: 68px; }
    .leaflet-control-attribution { font-size: 9px; }
    .marker { width: 38px; height: 38px; border: 3px solid white; border-radius: 50%; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.35); background: #dce7e8; }
    .marker img { width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const center = ${centerJson};
    const points = ${points};
    const map = L.map('map', { zoomControl: true }).setView([center.latitude, center.longitude], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    points.forEach((point) => {
      const markerContent = point.avatarUrl
        ? '<img src="' + point.avatarUrl + '" alt="" />'
        : '<div style="width:100%;height:100%;background:' + point.color + '"></div>';
      const icon = L.divIcon({ className: '', html: '<div class="marker">' + markerContent + '</div>', iconSize: [44, 44], iconAnchor: [22, 22] });
      L.marker([point.latitude, point.longitude], { icon, zIndexOffset: point.selected ? 1000 : 0 }).addTo(map).bindPopup(point.title);
    });
  </script>
</body>
</html>`;
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [sharing, setSharing] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [selectedMapPersonId, setSelectedMapPersonId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const tokenRef = useRef('');
  const userIdRef = useRef('');
  const lastPublishedLocationRef = useRef<Coordinates | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    userIdRef.current = user?.id || '';
  }, [user?.id]);

  useEffect(() => {
    const stopSharingFromNotification = async () => {
      try {
        const currentToken = tokenRef.current || await AsyncStorage.getItem('pingme-token');
        if (!currentToken) return;
        await apiRequest('/me/location-sharing', {
          method: 'POST',
          body: JSON.stringify({ enabled: false }),
        }, currentToken);
        await AsyncStorage.setItem('pingme-location-sharing', 'false');
        await stopBackgroundLocationTracking();
        setSharing(false);
        BackHandler.exitApp();
      } catch (error) {
        console.error('PingMe could not stop sharing from notification', error);
      }
    };

    const handleUrl = ({ url }: { url: string }) => {
      if (url === 'pingme://stop-sharing') stopSharingFromNotification().catch((error) => console.error('PingMe notification action failed', error));
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url === 'pingme://stop-sharing') return stopSharingFromNotification();
      return undefined;
    }).catch((error) => console.error('PingMe could not read notification action', error));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('pingme-token').then(async (storedToken) => {
      if (!storedToken) return;
      try {
        const response = await apiRequest<{ user: User; location: ApiLocation | null }>('/me', {}, storedToken);
        if (!active) return;
        tokenRef.current = storedToken;
        userIdRef.current = response.user.id;
        setToken(storedToken);
        setUser(response.user);
        setSharing(Boolean(response.user.locationSharingEnabled ?? true));
        await AsyncStorage.setItem('pingme-location-sharing', String(Boolean(response.user.locationSharingEnabled ?? true)));
        setSignedIn(true);
        await refreshLocations().catch(() => undefined);
      } catch {
        if (active) await signOut();
      } finally {
        if (active) setLoadingSession(false);
      }
    }).catch(() => {
      if (active) setLoadingSession(false);
    }).finally(() => {
      if (active) setLoadingSession(false);
    });
    return () => { active = false; };
  }, []);

  async function refreshLocations() {
    const currentToken = tokenRef.current;
    const currentUserId = userIdRef.current;
    if (!currentToken || !currentUserId) return;
    const response = await apiRequest<{ locations?: ApiLocation[] }>('/locations', {}, currentToken);
    const nextPeople = mapPeople(Array.isArray(response.locations) ? response.locations : [], currentUserId);
    setPeople(nextPeople);
    const currentUserLocation = nextPeople.find((person) => person.isUser);
    if (currentUserLocation) {
      setCurrentCoordinates({ latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude });
    }
  }

  async function completeAuth(response: { token: string; user: User }) {
    tokenRef.current = response.token;
    userIdRef.current = response.user.id;
    await AsyncStorage.setItem('pingme-token', response.token);
    setToken(response.token);
    setUser(response.user);
    setSharing(Boolean(response.user.locationSharingEnabled ?? true));
    setPeople([]);
    setCurrentCoordinates(null);
    setSelectedMapPersonId(null);
    setToast('');
    await AsyncStorage.setItem('pingme-location-sharing', String(Boolean(response.user.locationSharingEnabled ?? true)));
    setSignedIn(true);
    try {
      await refreshLocations();
    } catch {
      // The signed-in state is usable even when the first location refresh is unavailable.
    }
  }

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const refresh = () => {
      refreshLocations().catch(() => undefined);
    };
    refresh();
    const interval = setInterval(refresh, 10000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (active && state === 'active') refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !sharing) {
      lastPublishedLocationRef.current = null;
      if (signedIn) stopBackgroundLocationTracking().catch((error) => console.error('PingMe could not stop background location', error));
      return;
    }
    let active = true;

    async function startLocationUpdates() {
      const permissionsGranted = await startBackgroundLocationTracking();
      if (!active || !permissionsGranted) return;

      const publishCurrentLocation = async () => {
        if (!active) return;
        try {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!active) return;
          const coordinates = { latitude: current.coords.latitude, longitude: current.coords.longitude };
          setCurrentCoordinates(coordinates);
          const lastPublished = lastPublishedLocationRef.current;
          if (lastPublished && distanceInMeters(lastPublished, coordinates) < 25) return;
          await apiRequest('/locations', {
            method: 'POST',
            body: JSON.stringify(coordinates),
          }, tokenRef.current);
          lastPublishedLocationRef.current = coordinates;
        } catch {
          // Location updates are best effort; map refresh continues independently.
        }
      };

      await publishCurrentLocation();
        if (!active) return;
      const interval = setInterval(publishCurrentLocation, 10000);
      return () => clearInterval(interval);
    }

    let stopUpdates: (() => void) | undefined;
    startLocationUpdates().then((stop) => {
      stopUpdates = stop;
    }).catch(() => undefined);
    return () => {
      active = false;
      stopUpdates?.();
    };
  }, [signedIn, sharing]);

  async function signOut() {
    tokenRef.current = '';
    userIdRef.current = '';
    await AsyncStorage.removeItem('pingme-token');
    await AsyncStorage.removeItem('pingme-location-sharing');
    await stopBackgroundLocationTracking().catch((error) => console.error('PingMe could not stop background location', error));
    setToken('');
    setUser(null);
    setPeople([]);
    setCurrentCoordinates(null);
    setSelectedMapPersonId(null);
    setToast('');
    setSignedIn(false);
    setTab('home');
  }

  async function toggleSharing(value: boolean) {
    setSharing(value);
    await AsyncStorage.setItem('pingme-location-sharing', String(value));
    const currentToken = tokenRef.current;
    if (!currentToken) return;
    try {
      await apiRequest('/me/location-sharing', { method: 'POST', body: JSON.stringify({ enabled: value }) }, currentToken);
      if (value) {
        const permissionsGranted = await startBackgroundLocationTracking();
        if (permissionsGranted) {
          const current = await Location.getCurrentPositionAsync({});
          await apiRequest('/locations', { method: 'POST', body: JSON.stringify({ latitude: current.coords.latitude, longitude: current.coords.longitude }) }, currentToken);
        }

      } else {
        await stopBackgroundLocationTracking();
      }
      await refreshLocations();
    } catch {
      setSharing(!value);
      await AsyncStorage.setItem('pingme-location-sharing', String(!value));
    }
  }

  function notify(message: string) {
    setToast(message);
  }

  function updateUser(updatedUser: User) {
    setUser(updatedUser);
    setSharing(Boolean(updatedUser.locationSharingEnabled ?? sharing));
    setPeople((currentPeople) => currentPeople.map((person) => person.id === updatedUser.id ? { ...person, name: updatedUser.name, avatarId: updatedUser.avatarId } : person));
  }

  if (loadingSession) return <SafeAreaView style={styles.login}><ActivityIndicator color="#176B87" /></SafeAreaView>;
  if (!signedIn) return <Login onAuthenticated={completeAuth} />;
  return <SafeAreaView style={styles.app}><StatusBar style="dark" />{tab === 'home' && <Home people={people} currentCoordinates={currentCoordinates} selectedPersonId={selectedMapPersonId} onSelectPerson={setSelectedMapPersonId} sharing={sharing} onToggleSharing={toggleSharing} userName={user?.name || 'there'} />}{tab === 'circle' && <Circle people={people} token={token} userId={user?.id || ''} onRefresh={refreshLocations} onSelectFriend={(personId) => { setSelectedMapPersonId(personId); setTab('home'); }} onNotify={notify} />}{tab === 'settings' && <Settings user={user} token={token} sharing={sharing} onToggleSharing={toggleSharing} onUserUpdated={updateUser} onSignOut={signOut} onNotify={notify} />}<Notice message={toast} onDismiss={() => setToast('')} /><Navigation tab={tab} onChange={setTab} /></SafeAreaView>;
}

function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const offset = useRef(new Animated.Value(-90)).current;

  useEffect(() => {
    if (!message) return;
    Animated.timing(offset, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(offset, { toValue: -90, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, 2800);
    return () => clearTimeout(timer);
  }, [message, offset, onDismiss]);

  if (!message) return null;
  return <Animated.View style={[styles.noticeToast, { transform: [{ translateY: offset }] }]}><Text style={styles.noticeToastText}>{message}</Text></Animated.View>;
}

function Login({ onAuthenticated }: { onAuthenticated: (response: { token: string; user: User }) => Promise<void> }) {
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (registering) {
        await apiRequest<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, name, email: identifier, password }) });
        setRegistering(false);
        setPassword('');
        setNotice('Account created. Sign in to continue.');
        return;
      }
      const response = await apiRequest<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      await onAuthenticated(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.login}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.brandLockup}>
            <Image source={require('./assets/icon.png')} style={styles.logoImage} />
            <View>
              <Text style={styles.wordmark}><Text style={styles.wordmarkPing}>Ping</Text><Text style={styles.wordmarkMe}>Me</Text></Text>
              <Text style={styles.slogan}>STAY CLOSE. STAY CONNECTED.</Text>
            </View>
          </View>
        <Text style={styles.eyebrow}>{registering ? 'CREATE YOUR ACCOUNT' : 'WELCOME TO PINGME'}</Text>
        <Text style={styles.title}>Your people,{'\n'}your place.</Text>
        <Text style={styles.subtitle}>A quieter way to stay connected with the people who matter.</Text>
        <View style={styles.form}>
          {registering && (
            <>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput style={styles.input} placeholder="alexmorgan" placeholderTextColor="#8B949D" value={username} onChangeText={setUsername} autoCapitalize="none" />
              <Text style={styles.label}>YOUR NAME</Text>
              <TextInput style={styles.input} placeholder="Alex Morgan" placeholderTextColor="#8B949D" value={name} onChangeText={setName} />
            </>
          )}
          <Text style={styles.label}>{registering ? 'EMAIL ADDRESS' : 'EMAIL OR USERNAME'}</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#8B949D" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType={registering ? 'email-address' : 'default'} />
          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordRow}>
            <TextInput style={styles.passwordInput} placeholder="Enter your password" placeholderTextColor="#8B949D" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <Pressable style={styles.passwordToggle} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.primary} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{registering ? 'Create account' : 'Sign in securely'}</Text>}
          </Pressable>
          {Boolean(notice) && <Text style={styles.notice}>{notice}</Text>}
          {Boolean(error) && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={() => setRegistering(!registering)}>
            <Text style={styles.link}>{registering ? 'Already have an account? Sign in' : 'New to PingMe? Create an account'}</Text>
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Home({ people, currentCoordinates, selectedPersonId, onSelectPerson, sharing, onToggleSharing, userName }: { people: Person[]; currentCoordinates: Coordinates | null; selectedPersonId: string | null; onSelectPerson: (personId: string) => void; sharing: boolean; onToggleSharing: (value: boolean) => void; userName: string }) {
  const { height: screenHeight } = useWindowDimensions();
  const circleScrollRef = useRef<ScrollView>(null);
  const [circleHasMore, setCircleHasMore] = useState(false);
  const me = people.find((person) => person.isUser);
  const selectedPerson = people.find((person) => person.id === selectedPersonId);
  const mapCenter = selectedPerson || (currentCoordinates ? { ...currentCoordinates } : me) || people[0];

  if (!mapCenter) return <View style={styles.emptyState}><Text style={styles.emptyText}>You're signed in, but nobody has a shared location yet. Turn on location sharing to appear on the map.</Text><Switch value={sharing} onValueChange={onToggleSharing} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor={sharing ? '#2D8B61' : '#fff'} /></View>;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} disableScrollViewPanResponder>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>{todayLabel()}</Text>
          <Text style={styles.heading}>{greetingLabel()}, {userName}.</Text>
        </View>
      </View>
      <View style={[styles.mapCard, { height: Math.min(390, Math.max(300, screenHeight * 0.42)) }]}>
        <WebView
          style={styles.map}
          originWhitelist={['*']}
          source={{ html: mapHtml(people, mapCenter, selectedPersonId) }}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL="/"
          scrollEnabled
          nestedScrollEnabled
        />
        <Pressable style={styles.mapLabel} onPress={() => me && onSelectPerson(me.id)}>
          <View style={[styles.dot, { backgroundColor: sharing ? '#4BA67A' : '#9BA5B4' }]} />
          <Text style={styles.mapLabelText}>{sharing ? 'Your location is visible' : 'Your location is private'}</Text>
        </Pressable>
      </View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Your circle</Text>
      </View>
      <View style={styles.circleScrollerWrap}>
        <ScrollView
          ref={circleScrollRef}
          style={styles.circleScroller}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          onContentSizeChange={(_, contentHeight) => setCircleHasMore(contentHeight > 190)}
          onScroll={(event) => setCircleHasMore(event.nativeEvent.contentOffset.y + 190 < event.nativeEvent.contentSize.height - 4)}
          scrollEventThrottle={100}
        >
        {people.filter((person) => !person.isUser).map((person) => (
          <View key={person.id} style={styles.circlePerson}><PersonRow person={person} onPress={() => onSelectPerson(person.id)} /></View>
        ))}
        </ScrollView>
        {circleHasMore && <Pressable style={styles.circleDownButton} onPress={() => circleScrollRef.current?.scrollToEnd({ animated: true })}><Text style={styles.circleDownButtonText}>⌄</Text></Pressable>}
      </View>
    </ScrollView>
  );
}

function Circle({ people, token, userId, onRefresh, onSelectFriend, onNotify }: { people: Person[]; token: string; userId: string; onRefresh: () => Promise<void>; onSelectFriend: (personId: string) => void; onNotify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [showSentRequests, setShowSentRequests] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');

  async function loadRequests() {
    const response = await apiRequest<{ requests?: FriendRequest[] }>('/friend-requests', {}, token);
    setRequests(Array.isArray(response.requests) ? response.requests : []);
  }

  async function loadFriends() {
    const response = await apiRequest<{ friends?: User[] }>('/friends', {}, token);
    setFriends(Array.isArray(response.friends) ? response.friends : []);
  }

  async function refreshAll() {
    await Promise.all([loadRequests(), loadFriends()]);
    await onRefresh().catch(() => undefined);
  }

  async function search() {
    if (query.trim().length < 2) return;
    try {
      const response = await apiRequest<{ users: User[] }>(`/users/search?q=${encodeURIComponent(query.trim())}`, {}, token);
      setResults(response.users);
    } catch (error) {
      setMessage(GENERIC_ERROR);
    }
  }

  async function sendRequest(target: User) {
    setBusyId(target.id);
    setMessage('');
    try {
      await apiRequest('/friend-requests', { method: 'POST', body: JSON.stringify({ userId: target.id }) }, token);
      setMessage(`Request sent to ${target.name}`);
      setResults((current) => current.filter((user) => user.id !== target.id));
      await loadRequests();
      onNotify(`Request sent to ${target.name}`);
    } catch (error) {
      setMessage(GENERIC_ERROR);
    } finally {
      setBusyId('');
    }

  }

  async function removeFriend(friend: User) {
    setBusyId(friend.id);
    try {
      await apiRequest(`/friends/${friend.id}/remove`, { method: 'POST' }, token);
      setFriends((current) => current.filter((item) => item.id !== friend.id));
      setRemoveTarget(null);
      await onRefresh();
      onNotify(`${friend.name} removed from your circle`);
    } catch (error) {
      setMessage(GENERIC_ERROR);
    } finally {
      setBusyId('');
    }
  }

  async function decide(request: FriendRequest, decision: 'accept' | 'decline') {
    setBusyId(request.id);
    try {
      await apiRequest(`/friend-requests/${request.id}/${decision}`, { method: 'POST' }, token);
      await refreshAll();
    } catch (error) {
      setMessage(GENERIC_ERROR);
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    let active = true;
    const refresh = () => {
      refreshAll().catch(() => {
        if (active) setMessage(GENERIC_ERROR);
      });
    };
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const incomingRequests = requests.filter((request) => request.receiverId === userId && request.status === 'pending');
  const sentRequests = requests.filter((request) => request.senderId === userId && request.status === 'pending');
  const acceptedFriends = friends;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>YOUR PEOPLE</Text>
          <Text style={styles.heading}>Trusted circle</Text>
        </View>
        <View style={styles.circleActions}>
        <Pressable style={styles.friendStatusButton} onPress={() => setShowSentRequests(true)}>
          <Text style={styles.friendStatusIcon}>☷</Text>
          <Text style={styles.friendStatusLabel}>Requests</Text>
          {sentRequests.length > 0 && <View style={styles.friendStatusBadge} />}
        </Pressable>
        </View>
      </View>

      <Text style={styles.pageIntro}>Search by username and choose who can see your location.</Text>

      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="Search username" placeholderTextColor="#8B949D" value={query} onChangeText={setQuery} autoCapitalize="none" onSubmitEditing={search} />
        <Pressable style={styles.searchButton} onPress={search}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {Boolean(message) && <Text style={styles.requestNotice}>{message}</Text>}

      {results.map((result) => {
        const isFriend = acceptedFriends.some((friend) => friend.id === result.id);
        const hasPendingRequest = requests.some((request) => request.status === 'pending' && (request.senderId === result.id || request.receiverId === result.id));
        return (
        <View key={result.id} style={styles.person}>
          {result.avatarId ? <Image source={avatarImages[result.avatarId]} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: '#176B87' }]}><Text style={styles.avatarText}>{result.name.slice(0, 2).toUpperCase()}</Text></View>}
          <View style={styles.personCopy}>
            <Text style={styles.personName}>{result.name}</Text>
            <Text style={styles.personStatus}>@{result.username}</Text>
          </View>
          <Pressable style={[styles.smallButton, isFriend && styles.friendButton]} onPress={() => !isFriend && sendRequest(result)} disabled={isFriend || hasPendingRequest || busyId === result.id}>
            <Text style={[styles.smallButtonText, isFriend && styles.friendButtonText]}>{isFriend ? 'Friend' : hasPendingRequest ? 'Pending' : busyId === result.id ? '...' : 'Add'}</Text>
          </Pressable>
        </View>
        );
      })}

      {acceptedFriends.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Friends</Text>
          {acceptedFriends.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <Pressable style={styles.friendMain} onPress={() => onSelectFriend(friend.id)}>
              {friend.avatarId ? <Image source={avatarImages[friend.avatarId]} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: '#176B87' }]}><Text style={styles.avatarText}>{friend.name.slice(0, 2).toUpperCase()}</Text></View>}
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{friend.name}</Text>
                <Text style={styles.personStatus}>@{friend.username}</Text>
              </View>
              </Pressable>
              <Pressable style={styles.moreButton} onPress={() => setMenuTarget(menuTarget === friend.id ? null : friend.id)} hitSlop={8}>
                <Text style={styles.moreButtonText}>•••</Text>
              </Pressable>
              {menuTarget === friend.id && (
                <View style={styles.friendMenu}>
                  <Pressable onPress={() => { setMenuTarget(null); setRemoveTarget(friend); }}>
                    <Text style={styles.friendMenuText}>Remove friend</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {incomingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Incoming requests</Text>
          {incomingRequests.map((request) => (
            <View key={request.id} style={styles.person}>
              {request.senderAvatarId ? <Image source={avatarImages[request.senderAvatarId]} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: '#C08B45' }]}><Text style={styles.avatarText}>{request.senderName.slice(0, 2).toUpperCase()}</Text></View>}
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{request.senderName}</Text>
                <Text style={styles.personStatus}>@{request.senderUsername} wants to connect</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable style={styles.smallButton} onPress={() => decide(request, 'accept')} disabled={busyId === request.id}>
                  <Text style={styles.smallButtonText}>{busyId === request.id ? '...' : 'Accept'}</Text>
                </Pressable>
                <Pressable style={styles.declineButton} onPress={() => decide(request, 'decline')} disabled={busyId === request.id}>
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Modal visible={showSentRequests} transparent animationType="fade" onRequestClose={() => setShowSentRequests(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Sent requests</Text>
          {sentRequests.length === 0 && <Text style={styles.modalCopy}>No sent requests.</Text>}
          {sentRequests.map((request) => {
            const otherName = request.senderId === userId ? request.receiverName : request.senderName;
            const otherUsername = request.senderId === userId ? request.receiverUsername : request.senderUsername;
            return (
              <View key={request.id} style={styles.person}>
                {(() => {
                  const avatarId = request.senderId === userId ? request.receiverAvatarId : request.senderAvatarId;
                  return avatarId ? <Image source={avatarImages[avatarId]} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: '#176B87' }]}><Text style={styles.avatarText}>{otherName.slice(0, 2).toUpperCase()}</Text></View>;
                })()}
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{otherName}</Text>
                  <Text style={styles.personStatus}>@{otherUsername}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(request.status) }]}>
                  <Text style={styles.statusBadgeText}>{request.status}</Text>
                </View>
              </View>
            );
          })}
          <Pressable style={styles.secondaryButton} onPress={() => setShowSentRequests(false)}><Text style={styles.secondaryButtonText}>Close</Text></Pressable>
        </View></View>
      </Modal>
      <Modal visible={Boolean(removeTarget)} transparent animationType="fade" onRequestClose={() => setRemoveTarget(null)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Remove friend?</Text>
          <Text style={styles.modalCopy}>Remove {removeTarget?.name || 'this friend'} from your trusted circle?</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.declineButton} onPress={() => setRemoveTarget(null)}><Text style={styles.declineText}>Cancel</Text></Pressable>
            <Pressable style={styles.smallButton} onPress={() => removeTarget && removeFriend(removeTarget)} disabled={busyId === removeTarget?.id}><Text style={styles.smallButtonText}>Remove</Text></Pressable>
          </View>
        </View></View>
      </Modal>

    </ScrollView>
  );
}

function Settings({ user, token, sharing, onToggleSharing, onUserUpdated, onSignOut, onNotify }: { user: User | null; token: string; sharing: boolean; onToggleSharing: (value: boolean) => void; onUserUpdated: (user: User) => void; onSignOut: () => void; onNotify: (message: string) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'details' | 'password'>('details');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [username, setUsername] = useState(user?.username || '');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarId, setAvatarId] = useState<AvatarId>(user?.avatarId || 'avatar_01');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setUsername(user?.username || '');
    setName(user?.name || '');
    setEmail(user?.email || '');
    setAvatarId(user?.avatarId || 'avatar_01');
  }, [user]);

  async function saveProfile() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await apiRequest<{ user: User }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, name, email, avatarId }),
      }, token);
      onUserUpdated({ ...response.user, locationSharingEnabled: user?.locationSharingEnabled });
      setEditingField(null);
      onNotify('Profile updated.');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : GENERIC_ERROR;
      setError(message);
      onNotify(message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      const message = 'New password must match the confirmation password.';
      setError(message);
      onNotify(message);
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await apiRequest('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      }, token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onNotify('Password changed.');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : GENERIC_ERROR;
      setError(message);
      onNotify(message);
    } finally {
      setBusy(false);
    }
  }

  if (!profileOpen) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.heading}>Settings</Text>
        <Pressable style={styles.profile} onPress={() => setProfileOpen(true)}>
          <Image source={avatarImages[user?.avatarId || 'avatar_01']} style={styles.profileAvatar} />
          <View style={styles.shareCopy}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>@{user?.username || ''}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
        <Text style={styles.settingsLabel}>PRIVACY</Text>
        <View style={styles.settingRow}>
          <View style={styles.shareCopy}>
            <Text style={styles.cardTitle}>Location sharing</Text>
            <Text style={styles.cardSub}>{sharing ? 'Available to your circle' : 'Private for everyone'}</Text>
          </View>
          <Switch value={sharing} onValueChange={onToggleSharing} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor={sharing ? '#2D8B61' : '#fff'} />
        </View>
        <Text style={styles.settingsLabel}>SUPPORT</Text>
        <View style={styles.privacyBlock}>
          <Text style={styles.cardTitle}>Privacy and safety</Text>
          <Text style={styles.cardSub}>Only accepted friends can see your shared location. You can pause sharing at any time.</Text>
        </View>
        <Pressable style={styles.signOutButton} onPress={() => setConfirmSignOut(true)}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
        <Modal visible={confirmSignOut} transparent animationType="fade" onRequestClose={() => setConfirmSignOut(false)}>
          <View style={styles.modalBackdrop}><View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            <Text style={styles.modalCopy}>You will need to sign in again to see your circle.</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.declineButton} onPress={() => setConfirmSignOut(false)}><Text style={styles.declineText}>Cancel</Text></Pressable>
              <Pressable style={styles.smallButton} onPress={() => { setConfirmSignOut(false); onSignOut(); }}><Text style={styles.smallButtonText}>Sign out</Text></Pressable>
            </View>
          </View></View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable style={styles.backButton} onPress={() => setProfileOpen(false)}>
        <Text style={styles.backButtonText}>‹ Settings</Text>
      </Pressable>
      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <Text style={styles.heading}>Your profile</Text>
      <View style={styles.profileEditorAvatar}>
        <Image source={avatarImages[avatarId]} style={styles.profileAvatar} />
      </View>
      <Text style={styles.fieldHint}>Choose a profile icon</Text>
      <View style={styles.avatarGrid}>
        {avatarIds.map((id) => (
          <Pressable key={id} style={[styles.avatarChoice, avatarId === id && styles.avatarChoiceSelected]} onPress={() => { setAvatarId(id); setEditingField('avatar'); }}>
            <Image source={avatarImages[id]} style={styles.avatarChoiceImage} />
          </Pressable>
        ))}
      </View>
      <View style={styles.profileTabs}>
        <Pressable style={[styles.profileTab, profileTab === 'details' && styles.profileTabActive]} onPress={() => setProfileTab('details')}><Text style={[styles.profileTabText, profileTab === 'details' && styles.profileTabTextActive]}>Profile details</Text></Pressable>
        <Pressable style={[styles.profileTab, profileTab === 'password' && styles.profileTabActive]} onPress={() => setProfileTab('password')}><Text style={[styles.profileTabText, profileTab === 'password' && styles.profileTabTextActive]}>Change password</Text></Pressable>
      </View>
      {profileTab === 'details' ? <>
        <Text style={styles.settingsLabel}>PROFILE DETAILS</Text>
        <EditableProfileField label="Username" value={username} onChangeText={setUsername} editing={editingField === 'Username'} onEdit={() => setEditingField('Username')} />
        <EditableProfileField label="Name" value={name} onChangeText={setName} editing={editingField === 'Name'} onEdit={() => setEditingField('Name')} />
        <EditableProfileField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" editing={editingField === 'Email'} onEdit={() => setEditingField('Email')} />
        {editingField && <Pressable style={styles.primary} onPress={saveProfile} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save profile</Text>}
        </Pressable>}
      </> : <>
        <Text style={styles.settingsLabel}>CHANGE PASSWORD</Text>
        <PasswordField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} />
        <PasswordField label="New password" value={newPassword} onChangeText={setNewPassword} />
        <PasswordField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} />
        {Boolean(confirmPassword && newPassword !== confirmPassword) && <Text style={styles.error}>New password must match the confirmation password.</Text>}
        <Pressable style={[styles.secondaryButton, (!currentPassword || !newPassword || !confirmPassword) && styles.disabledButton]} onPress={changePassword} disabled={busy || !currentPassword || !newPassword || !confirmPassword}>
          {busy ? <ActivityIndicator color="#0B6EF3" /> : <Text style={styles.secondaryButtonText}>Change password</Text>}
        </Pressable>
      </>}
      {Boolean(message) && <Text style={styles.notice}>{message}</Text>}
      {Boolean(error) && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function EditableProfileField({ label, value, onChangeText, editing, onEdit, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; editing: boolean; onEdit: () => void; keyboardType?: 'default' | 'email-address' }) {
  return (
    <View style={styles.profileField}>
      <View style={styles.profileFieldHeader}>
        <Text style={styles.profileFieldLabel}>{label}</Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={styles.editButton}>✎</Text>
        </Pressable>
      </View>
      {editing ? <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} autoCapitalize="none" autoFocus /> : <Text style={styles.profileFieldValue}>{value || 'Not set'}</Text>}
    </View>
  );
}

function PasswordField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.profileField}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput style={styles.passwordInput} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" />
        <Pressable style={styles.passwordToggle} onPress={() => setVisible(!visible)}>
          <Text style={styles.passwordToggleText}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PersonRow({ person, detailed = false, onPress }: { person: Person; detailed?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={styles.person} onPress={onPress} disabled={!onPress}>
      {person.avatarId ? <Image source={avatarImages[person.avatarId]} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: person.color }]}><Text style={styles.avatarText}>{person.initials}</Text></View>}
      <View style={styles.personCopy}>
        <Text style={styles.personName}>{person.name}</Text>
        <Text style={styles.personStatus}>{detailed ? `${person.place}  ·  ${person.locationSharingEnabled ? 'Live' : person.updated}` : person.locationSharingEnabled ? 'Live' : person.updated}</Text>
      </View>
      <View style={styles.personOnline}>
        <View style={[styles.onlineDot, !person.locationSharingEnabled && styles.offlineDot]} />
      </View>
    </Pressable>
  );
}

function Navigation({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <View style={styles.nav}>
      {[['home', '⌂', 'Home'], ['circle', '◉', 'Circle'], ['settings', '⚙', 'Settings']].map(([key, icon, label]) => (
        <Pressable key={key} style={styles.navItem} onPress={() => onChange(key as Tab)}>
          <Text style={[styles.navIcon, tab === key && styles.navActive]}>{icon}</Text>
          <Text style={[styles.navLabel, tab === key && styles.navActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#F5F8FC' },
  login: { flex: 1, backgroundColor: '#F8FBFF' },
  keyboard: { flex: 1 },
  loginScroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, justifyContent: 'center', flexGrow: 1 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  logoImage: { width: 72, height: 72, marginRight: 13 },
  wordmark: { fontSize: 30, lineHeight: 32, fontWeight: '900' },
  wordmarkPing: { color: '#10224E' },
  wordmarkMe: { color: '#10BFAF' },
  slogan: { color: '#10224E', fontSize: 8, letterSpacing: 2, fontWeight: '700', marginTop: 5 },
  logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#0B6EF3', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#70809A', fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: '#10224E', fontSize: 36, lineHeight: 40, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#66727F', fontSize: 16, lineHeight: 23, marginTop: 18 },
  form: { marginTop: 30 },
  label: { color: '#78818D', fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginTop: 14, marginBottom: 7 },
  input: { height: 53, backgroundColor: '#fff', borderColor: '#D5E0F0', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, color: '#10224E', fontSize: 15 },
  passwordRow: { height: 53, backgroundColor: '#fff', borderColor: '#D5E0F0', borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, height: 51, paddingHorizontal: 16, color: '#10224E', fontSize: 15 },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 10 },
  passwordToggleText: { color: '#0B6EF3', fontSize: 12, fontWeight: '800' },
  primary: { height: 54, borderRadius: 14, backgroundColor: '#0B6EF3', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#0B6EF3', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  disabledButton: { opacity: 0.45 },
  secondaryButtonText: { color: '#0B6EF3', fontSize: 14, fontWeight: '700' },
  error: { color: '#B34D3B', textAlign: 'center', marginTop: 12, fontSize: 12 },
  notice: { color: '#129B83', textAlign: 'center', marginTop: 12, fontSize: 12, fontWeight: '700' },
  link: { color: '#0B6EF3', textAlign: 'center', marginTop: 18, fontSize: 13, fontWeight: '700' },
  footer: { color: '#99A1A8', fontSize: 11, textAlign: 'center', position: 'absolute', bottom: 34, left: 28, right: 28 },
  scroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 34 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 8, marginBottom: 18 },
  heading: { color: '#10224E', fontSize: 24, lineHeight: 30, fontWeight: '800', marginTop: 6, flexShrink: 1 },
  notification: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  bell: { color: '#0B6EF3', fontSize: 25, transform: [{ rotate: '-30deg' }] },
  mapCard: { height: 430, borderRadius: 22, overflow: 'hidden', position: 'relative', backgroundColor: '#DCE7E8' },
  map: { flex: 1 },
  mapLabel: { position: 'absolute', left: 14, top: 14, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mapLabelText: { color: '#10224E', fontSize: 11, fontWeight: '700' },
  zoom: { position: 'absolute', right: 13, bottom: 13, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', paddingVertical: 2, width: 34 },
  zoomText: { color: '#176B87', fontSize: 20, lineHeight: 25 },
  zoomLine: { height: 1, backgroundColor: '#E4E7E6', width: 20 },
  shareCard: { backgroundColor: '#fff', borderRadius: 18, padding: 15, marginTop: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E4ECF7' },
  shareIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#E8F4FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  shareIconText: { color: '#0B6EF3', fontSize: 22 },
  shareCopy: { flex: 1 },
  cardTitle: { color: '#10224E', fontSize: 14, fontWeight: '700' },
  cardSub: { color: '#7A8494', fontSize: 12, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 9 },
  sectionTitle: { color: '#1D2A35', fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  circleScroller: { maxHeight: 190, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2 },
  circleScrollerWrap: { position: 'relative' },
  circleDownButton: { position: 'absolute', right: 16, bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#0B6EF3', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#10224E', shadowOpacity: 0.2, shadowRadius: 5 },
  circleDownButtonText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '800' },
  circlePerson: { width: '100%' },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  avatarChoice: { width: 58, height: 58, borderRadius: 20, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  avatarChoiceSelected: { borderColor: '#0B6EF3' },
  avatarChoiceImage: { width: '100%', height: '100%', borderRadius: 16 },
  personCopy: { flex: 1 },
  personName: { color: '#1D2A35', fontSize: 14, fontWeight: '700' },
  personStatus: { color: '#7A8494', fontSize: 12, marginTop: 4 },
  personOnline: { width: 22, alignItems: 'center' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4BA67A' },
  offlineDot: { backgroundColor: '#A0A8AF' },
  nav: { height: 62, borderTopWidth: 1, borderTopColor: '#E2E5E1', backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 5 },
  navItem: { alignItems: 'center', width: 90 },
  navIcon: { color: '#A0A8AF', fontSize: 19, height: 23 },
  navLabel: { color: '#A0A8AF', fontSize: 10, fontWeight: '700', marginTop: 2 },
  navActive: { color: '#0B6EF3' },
  countPill: { backgroundColor: '#E8F2EF', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  countText: { color: '#2D8B61', fontSize: 11, fontWeight: '700' },
  circleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendStatusButton: { width: 104, height: 36, borderRadius: 12, backgroundColor: '#E8F4FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative', gap: 5 },
  friendStatusIcon: { color: '#0B6EF3', fontSize: 19, fontWeight: '800' },
  friendStatusLabel: { color: '#0B6EF3', fontSize: 11, fontWeight: '800' },
  friendStatusBadge: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10BFAF', position: 'absolute', right: 6, top: 5 },
  requestNotice: { color: '#0B6EF3', backgroundColor: '#E8F4FF', borderRadius: 12, padding: 10, fontSize: 12, fontWeight: '700', marginTop: 12 },
  pageIntro: { color: '#7A8494', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  invite: { backgroundColor: '#1D2A35', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  inviteIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#36505C', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  inviteIconText: { color: '#fff', fontSize: 22 },
  privacyBlock: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginTop: 4, borderWidth: 1, borderColor: '#E4ECF7' },
  arrow: { color: '#7A8494', fontSize: 26, marginLeft: 10 },
  profile: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 48, height: 48, borderRadius: 16, marginRight: 12 },
  profileEditorAvatar: { alignItems: 'center', marginTop: 22 },
  backButton: { marginBottom: 22 },
  backButtonText: { color: '#0B6EF3', fontSize: 14, fontWeight: '700' },
  fieldHint: { color: '#7A8494', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  profileField: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E4ECF7' },
  profileFieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileFieldLabel: { color: '#78818D', fontSize: 11, fontWeight: '700' },
  editButton: { color: '#0B6EF3', fontSize: 12, fontWeight: '800' },
  profileFieldValue: { color: '#1D2A35', fontSize: 15, marginTop: 8 },
  profileInitials: { color: '#fff', fontWeight: '800' },
  profileName: { color: '#1D2A35', fontSize: 15, fontWeight: '800' },
  profileEmail: { color: '#7A8494', fontSize: 12, marginTop: 4 },
  settingsLabel: { color: '#78818D', fontSize: 10, letterSpacing: 1.4, fontWeight: '800', marginTop: 27, marginBottom: 8 },
  settingRow: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EDF0ED', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textRow: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EDF0ED', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signOutButton: { borderColor: '#E5684A', borderWidth: 1, borderRadius: 14, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  signOutText: { color: '#D0533A', fontSize: 14, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#66727F', fontSize: 14, marginTop: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  searchInput: { flex: 1, height: 48, backgroundColor: '#fff', borderColor: '#D6DAD9', borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, color: '#1D2A35' },
  searchButton: { height: 48, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#176B87', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  searchButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  smallButton: { backgroundColor: '#176B87', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  smallButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  friendButton: { backgroundColor: '#E8F2EF' },
  friendButtonText: { color: '#2D8B61' },
  requestActions: { alignItems: 'flex-end', gap: 5 },
  declineButton: { paddingHorizontal: 8, paddingVertical: 3 },
  declineText: { color: '#D0533A', fontSize: 10, fontWeight: '800' },
  sharingIndicator: { alignItems: 'center' },
  sharingDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  sharingText: { fontSize: 10, fontWeight: '600' },
  friendRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  friendMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  moreButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  moreButtonText: { color: '#7A8494', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  friendMenu: { position: 'absolute', right: 6, top: 46, zIndex: 5, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, shadowColor: '#10224E', shadowOpacity: 0.16, shadowRadius: 8, elevation: 4 },
  friendMenuText: { color: '#D0533A', fontSize: 12, fontWeight: '700', paddingVertical: 7 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  profileTabs: { flexDirection: 'row', backgroundColor: '#E8F4FF', borderRadius: 14, padding: 4, marginTop: 24 },
  profileTab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  profileTabActive: { backgroundColor: '#fff' },
  profileTabText: { color: '#6E7D91', fontSize: 12, fontWeight: '700' },
  profileTabTextActive: { color: '#0B6EF3' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,34,78,0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 22, padding: 22 },
  modalTitle: { color: '#10224E', fontSize: 19, fontWeight: '800' },
  modalCopy: { color: '#66727F', fontSize: 14, lineHeight: 20, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20 },
  noticeToast: { position: 'absolute', top: 42, left: 18, right: 18, zIndex: 10, backgroundColor: '#10224E', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, shadowColor: '#10224E', shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 },
  noticeToastText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
