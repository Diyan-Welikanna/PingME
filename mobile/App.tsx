import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Tab = 'home' | 'circle' | 'settings';
type Person = { id: string; name: string; initials: string; color: string; latitude: number; longitude: number; place: string; updated: string; isUser?: boolean };
type User = { id: string; username: string; email: string; name: string; locationSharingEnabled?: boolean };
type ApiLocation = { userId: string; username?: string; name: string; latitude: number; longitude: number; updatedAt: string };
type FriendRequest = { id: string; status: string; senderId: string; senderUsername: string; senderName: string; receiverId: string; receiverUsername: string; receiverName: string; createdAt?: string; respondedAt?: string | null };
type Coordinates = { latitude: number; longitude: number };
const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ).replace(/\/$/, '');
const colors = ['#E5684A', '#176B87', '#C08B45', '#7B6B9E'];
let cachedApiUrl: string | null = null;

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
  } catch (error) {
    const detail = error instanceof Error ? (error.name === 'AbortError' ? 'timed out after 10s' : error.message) : 'network request failed';
    throw new Error(`Cannot reach PingMe API at ${apiUrl}${path} (${detail}). Use the same URL that works in Postman, keep PHP running on port 8080, and rebuild the app after HTTP/cleartext changes.`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: { message?: string } & T;
  try {
    body = text ? JSON.parse(text) : ({} as { message?: string } & T);
  } catch {
    throw new Error(`PingMe API returned an invalid response (${response.status})`);
  }
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body as T;
}

function mapPeople(locations: ApiLocation[] = [], userId: string): Person[] {
  return locations.flatMap((location, index) => {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const name = typeof location.name === 'string' && location.name.trim() ? location.name.trim() : 'PingMe user';
    const updatedAt = new Date(location.updatedAt);
    if (!location.userId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
    return [{ id: location.userId, name: location.userId === userId ? 'You' : name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], latitude, longitude, place: 'Shared location', updated: location.userId === userId || Number.isNaN(updatedAt.getTime()) ? 'Just now' : updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), isUser: location.userId === userId }];
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

function mapHtml(people: Person[], center: Coordinates) {
  const points = JSON.stringify(people.map((person) => ({
    latitude: person.latitude,
    longitude: person.longitude,
    title: person.isUser ? 'You' : person.name,
    color: person.color,
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
    .marker { width: 18px; height: 18px; border: 3px solid white; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
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
      const icon = L.divIcon({ className: '', html: '<div class="marker" style="background:' + point.color + '"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([point.latitude, point.longitude], { icon }).addTo(map).bindPopup(point.title);
    });
  </script>
</body>
</html>`;
}

export default function App() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [sharing, setSharing] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [selectedMapPersonId, setSelectedMapPersonId] = useState<string | null>(null);

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
        setSignedIn(true);
        await refreshLocations().catch(() => setPeople([]));
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
    setSignedIn(true);
    try {
      await refreshLocations();
    } catch {
      setPeople([]);
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
      return;
    }
    let active = true;

    async function startLocationUpdates() {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!active || permission.status !== 'granted') return;

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
    setToken('');
    setUser(null);
    setPeople([]);
    setCurrentCoordinates(null);
    setSignedIn(false);
    setTab('home');
  }

  async function toggleSharing(value: boolean) {
    setSharing(value);
    const currentToken = tokenRef.current;
    if (!currentToken) return;
    try {
      await apiRequest('/me/location-sharing', { method: 'POST', body: JSON.stringify({ enabled: value }) }, currentToken);
      if (value) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const current = await Location.getCurrentPositionAsync({});
          await apiRequest('/locations', { method: 'POST', body: JSON.stringify({ latitude: current.coords.latitude, longitude: current.coords.longitude }) }, currentToken);
        }
      }
      await refreshLocations();
    } catch {
      setSharing(!value);
    }
  }

  if (loadingSession) return <SafeAreaView style={styles.login}><ActivityIndicator color="#176B87" /></SafeAreaView>;
  if (!signedIn) return <Login onAuthenticated={completeAuth} />;
  return <SafeAreaView style={styles.app}><StatusBar style="dark" />{tab === 'home' && <Home people={people} currentCoordinates={currentCoordinates} selectedPersonId={selectedMapPersonId} onSelectPerson={setSelectedMapPersonId} sharing={sharing} onToggleSharing={toggleSharing} userName={user?.name || 'there'} />}{tab === 'circle' && <Circle people={people} token={token} userId={user?.id || ''} onRefresh={refreshLocations} onSelectFriend={(personId) => { setSelectedMapPersonId(personId); setTab('home'); }} />}{tab === 'settings' && <Settings user={user} sharing={sharing} onToggleSharing={toggleSharing} onSignOut={signOut} />}<Navigation tab={tab} onChange={setTab} /></SafeAreaView>;
}

function Login({ onAuthenticated }: { onAuthenticated: (response: { token: string; user: User }) => Promise<void> }) {
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = registering
        ? await apiRequest<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, name, email: identifier, password }) })
        : await apiRequest<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      await onAuthenticated(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect to PingMe');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.login}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>P</Text>
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
          <TextInput style={styles.input} placeholder="Enter your password" placeholderTextColor="#8B949D" value={password} onChangeText={setPassword} secureTextEntry />
          <Pressable style={styles.primary} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{registering ? 'Create account' : 'Sign in securely'}</Text>}
          </Pressable>
          {Boolean(error) && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={() => setRegistering(!registering)}>
            <Text style={styles.link}>{registering ? 'Already have an account? Sign in' : 'New to PingMe? Create an account'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Home({ people, currentCoordinates, selectedPersonId, onSelectPerson, sharing, onToggleSharing, userName }: { people: Person[]; currentCoordinates: Coordinates | null; selectedPersonId: string | null; onSelectPerson: (personId: string) => void; sharing: boolean; onToggleSharing: (value: boolean) => void; userName: string }) {
  const me = people.find((person) => person.isUser);
  const selectedPerson = people.find((person) => person.id === selectedPersonId);
  const mapCenter = selectedPerson || (currentCoordinates ? { ...currentCoordinates } : me) || people[0];

  if (!mapCenter) return <View style={styles.emptyState}><Text style={styles.emptyText}>You're signed in, but nobody has a shared location yet. Turn on location sharing to appear on the map.</Text><Switch value={sharing} onValueChange={onToggleSharing} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor={sharing ? '#2D8B61' : '#fff'} /></View>;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>{todayLabel()}</Text>
          <Text style={styles.heading}>Good morning, {userName}.</Text>
        </View>
        <View style={styles.notification}>
          <Text style={styles.bell}>⌁</Text>
        </View>
      </View>
      <View style={styles.mapCard}>
        <WebView
          style={styles.map}
          originWhitelist={['*']}
          source={{ html: mapHtml(people, mapCenter) }}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
        />
        <View style={styles.mapLabel}>
          <View style={[styles.dot, { backgroundColor: sharing ? '#4BA67A' : '#9BA5B4' }]} />
          <Text style={styles.mapLabelText}>{sharing ? 'Your location is visible' : 'Location sharing is paused'}</Text>
        </View>
      </View>
      <View style={styles.shareCard}>
        <View style={styles.shareIcon}>
          <Text style={styles.shareIconText}>⌖</Text>
        </View>
        <View style={styles.shareCopy}>
          <Text style={styles.cardTitle}>Share my location</Text>
          <Text style={styles.cardSub}>{sharing ? 'Your circle can see where you are.' : 'Your location is currently private.'}</Text>
        </View>
        <Switch value={sharing} onValueChange={onToggleSharing} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor={sharing ? '#2D8B61' : '#fff'} />
      </View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Your circle</Text>
        <Pressable>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      {people.slice(1, 3).map((person) => (
        <PersonRow key={person.id} person={person} onPress={() => onSelectPerson(person.id)} />
      ))}
    </ScrollView>
  );
}

function Circle({ people, token, userId, onRefresh, onSelectFriend }: { people: Person[]; token: string; userId: string; onRefresh: () => Promise<void>; onSelectFriend: (personId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [message, setMessage] = useState('');
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
      setMessage(error instanceof Error ? error.message : 'Search failed');
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
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
      setMessage(error instanceof Error ? error.message : 'Request update failed');
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    let active = true;
    const refresh = () => {
      refreshAll().catch(() => {
        if (active) setMessage('Unable to load data');
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
  const sentRequests = requests.filter((request) => request.senderId === userId);
  const acceptedFriends = friends;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>YOUR PEOPLE</Text>
          <Text style={styles.heading}>Trusted circle</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{acceptedFriends.length} people</Text>
        </View>
      </View>

      <Text style={styles.pageIntro}>Search by username and choose who can see your location.</Text>

      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="Search username" placeholderTextColor="#8B949D" value={query} onChangeText={setQuery} autoCapitalize="none" onSubmitEditing={search} />
        <Pressable style={styles.searchButton} onPress={search}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {Boolean(message) && <Text style={styles.link}>{message}</Text>}

      {results.map((result) => (
        <View key={result.id} style={styles.person}>
          <View style={[styles.avatar, { backgroundColor: '#176B87' }]}>
            <Text style={styles.avatarText}>{result.name.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.personCopy}>
            <Text style={styles.personName}>{result.name}</Text>
            <Text style={styles.personStatus}>@{result.username}</Text>
          </View>
          <Pressable style={styles.smallButton} onPress={() => sendRequest(result)} disabled={busyId === result.id}>
            <Text style={styles.smallButtonText}>{busyId === result.id ? '...' : 'Add'}</Text>
          </Pressable>
        </View>
      ))}

      {acceptedFriends.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Friends</Text>
          {acceptedFriends.map((friend) => (
            <Pressable key={friend.id} style={styles.person} onPress={() => onSelectFriend(friend.id)}>
              <View style={[styles.avatar, { backgroundColor: '#176B87' }]}>
                <Text style={styles.avatarText}>{friend.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{friend.name}</Text>
                <Text style={styles.personStatus}>@{friend.username}</Text>
              </View>
              <View style={styles.sharingIndicator}>
                <View style={[styles.sharingDot, { backgroundColor: friend.locationSharingEnabled ? '#4BA67A' : '#CBD4DA' }]} />
                <Text style={[styles.sharingText, { color: friend.locationSharingEnabled ? '#4BA67A' : '#9BA5B4' }]}>
                  {friend.locationSharingEnabled ? 'Sharing' : 'Paused'}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {incomingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Incoming requests</Text>
          {incomingRequests.map((request) => (
            <View key={request.id} style={styles.person}>
              <View style={[styles.avatar, { backgroundColor: '#C08B45' }]}>
                <Text style={styles.avatarText}>{request.senderName.slice(0, 2).toUpperCase()}</Text>
              </View>
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

      {sentRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Sent requests</Text>
          {sentRequests.map((request) => {
            const otherName = request.senderId === userId ? request.receiverName : request.senderName;
            const otherUsername = request.senderId === userId ? request.receiverUsername : request.senderUsername;
            return (
              <View key={request.id} style={styles.person}>
                <View style={[styles.avatar, { backgroundColor: '#176B87' }]}>
                  <Text style={styles.avatarText}>{otherName.slice(0, 2).toUpperCase()}</Text>
                </View>
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
        </>
      )}

    </ScrollView>
  );
}

function Settings({ user, sharing, onToggleSharing, onSignOut }: { user: User | null; sharing: boolean; onToggleSharing: (value: boolean) => void; onSignOut: () => void }) {
  const initials = user?.name ? user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : 'AM';
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <Text style={styles.heading}>Settings</Text>
      <View style={styles.profile}>
        <View style={[styles.profileAvatar, { backgroundColor: '#E5684A' }]}>
          <Text style={styles.profileInitials}>{initials}</Text>
        </View>
        <View style={styles.shareCopy}>
          <Text style={styles.profileName}>{user?.name || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>
      <Text style={styles.settingsLabel}>PRIVACY</Text>
      <View style={styles.settingRow}>
        <View style={styles.shareCopy}>
          <Text style={styles.cardTitle}>Location sharing</Text>
          <Text style={styles.cardSub}>{sharing ? 'Available to your circle' : 'Paused for everyone'}</Text>
        </View>
        <Switch value={sharing} onValueChange={onToggleSharing} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor={sharing ? '#2D8B61' : '#fff'} />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.shareCopy}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Text style={styles.cardSub}>Updates from your circle</Text>
        </View>
        <Switch value={true} trackColor={{ false: '#D3D8DC', true: '#A9D8C1' }} thumbColor="#2D8B61" />
      </View>
      <Text style={styles.settingsLabel}>SUPPORT</Text>
      <Pressable style={styles.textRow}>
        <Text style={styles.cardTitle}>Privacy and safety</Text>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
      <Pressable style={styles.textRow}>
        <Text style={styles.cardTitle}>Help center</Text>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function PersonRow({ person, detailed = false, onPress }: { person: Person; detailed?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={styles.person} onPress={onPress} disabled={!onPress}>
      <View style={[styles.avatar, { backgroundColor: person.color }]}>
        <Text style={styles.avatarText}>{person.initials}</Text>
      </View>
      <View style={styles.personCopy}>
        <Text style={styles.personName}>{person.name}</Text>
        <Text style={styles.personStatus}>{detailed ? `${person.place}  ·  ${person.updated}` : person.updated}</Text>
      </View>
      <View style={styles.personOnline}>
        <View style={styles.onlineDot} />
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
  app: { flex: 1, backgroundColor: '#F4F5F1' },
  login: { flex: 1, backgroundColor: '#F4F5F1' },
  loginScroll: { padding: 28, paddingBottom: 40, justifyContent: 'center', flexGrow: 1 },
  logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#E5684A', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#78818D', fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: '#1D2A35', fontSize: 42, lineHeight: 45, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#66727F', fontSize: 16, lineHeight: 23, marginTop: 18 },
  form: { marginTop: 30 },
  label: { color: '#78818D', fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginTop: 14, marginBottom: 7 },
  input: { height: 53, backgroundColor: '#fff', borderColor: '#D6DAD9', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, color: '#1D2A35', fontSize: 15 },
  primary: { height: 54, borderRadius: 14, backgroundColor: '#1D2A35', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: '#B34D3B', textAlign: 'center', marginTop: 12, fontSize: 12 },
  link: { color: '#176B87', textAlign: 'center', marginTop: 18, fontSize: 13, fontWeight: '700' },
  footer: { color: '#99A1A8', fontSize: 11, textAlign: 'center', position: 'absolute', bottom: 34, left: 28, right: 28 },
  scroll: { padding: 20, paddingBottom: 30 },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 15, marginBottom: 20 },
  heading: { color: '#1D2A35', fontSize: 25, fontWeight: '800', marginTop: 6 },
  notification: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bell: { color: '#176B87', fontSize: 25, transform: [{ rotate: '-30deg' }] },
  mapCard: { height: 285, borderRadius: 22, overflow: 'hidden', position: 'relative', backgroundColor: '#DCE7E8' },
  map: { flex: 1 },
  mapLabel: { position: 'absolute', left: 14, top: 14, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mapLabelText: { color: '#1D2A35', fontSize: 11, fontWeight: '700' },
  zoom: { position: 'absolute', right: 13, bottom: 13, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', paddingVertical: 2, width: 34 },
  zoomText: { color: '#176B87', fontSize: 20, lineHeight: 25 },
  zoomLine: { height: 1, backgroundColor: '#E4E7E6', width: 20 },
  shareCard: { backgroundColor: '#fff', borderRadius: 18, padding: 15, marginTop: 14, flexDirection: 'row', alignItems: 'center' },
  shareIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#E8F2EF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  shareIconText: { color: '#2D8B61', fontSize: 22 },
  shareCopy: { flex: 1 },
  cardTitle: { color: '#1D2A35', fontSize: 14, fontWeight: '700' },
  cardSub: { color: '#7A8494', fontSize: 12, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 9 },
  sectionTitle: { color: '#1D2A35', fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  seeAll: { color: '#176B87', fontSize: 12, fontWeight: '700' },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  personCopy: { flex: 1 },
  personName: { color: '#1D2A35', fontSize: 14, fontWeight: '700' },
  personStatus: { color: '#7A8494', fontSize: 12, marginTop: 4 },
  personOnline: { width: 22, alignItems: 'center' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4BA67A' },
  nav: { height: 76, borderTopWidth: 1, borderTopColor: '#E2E5E1', backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  navItem: { alignItems: 'center', width: 90 },
  navIcon: { color: '#A0A8AF', fontSize: 22, height: 27 },
  navLabel: { color: '#A0A8AF', fontSize: 10, fontWeight: '700', marginTop: 2 },
  navActive: { color: '#176B87' },
  countPill: { backgroundColor: '#E8F2EF', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  countText: { color: '#2D8B61', fontSize: 11, fontWeight: '700' },
  pageIntro: { color: '#7A8494', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  invite: { backgroundColor: '#1D2A35', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  inviteIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#36505C', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  inviteIconText: { color: '#fff', fontSize: 22 },
  arrow: { color: '#7A8494', fontSize: 26, marginLeft: 10 },
  profile: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
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
  requestActions: { alignItems: 'flex-end', gap: 5 },
  declineButton: { paddingHorizontal: 8, paddingVertical: 3 },
  declineText: { color: '#D0533A', fontSize: 10, fontWeight: '800' },
  sharingIndicator: { alignItems: 'center' },
  sharingDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  sharingText: { fontSize: 10, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});
