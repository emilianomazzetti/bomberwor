/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TeacherLanding } from './components/TeacherLanding';
import { HostScreen } from './components/HostScreen';
import { ControllerScreen } from './components/ControllerScreen';
import { SubjectType } from './data/educationalData';

type ViewMode = 'landing' | 'host' | 'controller';

export default function App() {
  const [mode, setMode] = useState<ViewMode>('landing');
  const [roomPin, setRoomPin] = useState<string>('');
  const [subject, setSubject] = useState<SubjectType>('ortografia');
  const [durationMinutes, setDurationMinutes] = useState<number>(3);
  const [maxPlayers, setMaxPlayers] = useState<number>(6);
  const [mysteryBoxes, setMysteryBoxes] = useState<boolean>(true);

  // Parse URL query parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const roomParam = params.get('room');

    if (modeParam === 'controller' || (roomParam && modeParam !== 'host')) {
      setMode('controller');
      if (roomParam) setRoomPin(roomParam);
    } else if (modeParam === 'host') {
      setMode('host');
      if (roomParam) setRoomPin(roomParam);
    } else {
      setMode('landing');
      if (roomParam) setRoomPin(roomParam);
    }
  }, []);

  const handleStartHost = (
    pin: string,
    chosenSubject: SubjectType,
    chosenDuration: number,
    chosenMaxPlayers: number,
    chosenMysteryBoxes: boolean
  ) => {
    setRoomPin(pin);
    setSubject(chosenSubject);
    setDurationMinutes(chosenDuration);
    setMaxPlayers(chosenMaxPlayers);
    setMysteryBoxes(chosenMysteryBoxes);
    setMode('host');

    // Update URL query string
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'host');
    url.searchParams.set('room', pin);
    window.history.pushState({}, '', url.toString());
  };

  const handleOpenController = (pin: string) => {
    setRoomPin(pin);
    setMode('controller');

    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'controller');
    url.searchParams.set('room', pin);
    window.history.pushState({}, '', url.toString());
  };

  const handleBackToLanding = () => {
    setMode('landing');
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());
  };

  if (mode === 'controller') {
    return (
      <ControllerScreen
        initialRoomPin={roomPin}
        onExit={handleBackToLanding}
      />
    );
  }

  if (mode === 'host') {
    return (
      <HostScreen
        pin={roomPin}
        subject={subject}
        durationMinutes={durationMinutes}
        maxPlayers={maxPlayers}
        mysteryBoxes={mysteryBoxes}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  return (
    <TeacherLanding
      onStartHost={handleStartHost}
      onOpenController={handleOpenController}
    />
  );
}
