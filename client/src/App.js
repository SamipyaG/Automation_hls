import React, { useState, useEffect } from 'react';
import { ChakraProvider, Box, Container, VStack, Heading } from '@chakra-ui/react';
import ManifestAnalyzer from './components/ManifestAnalyzer';
import LogViewer from './components/LogViewer';
import SegmentViewer from './components/SegmentViewer';
import Header from './components/Header';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [logs, setLogs] = useState([]);
  const [manifestData, setManifestData] = useState(null);
  const [segmentData, setSegmentData] = useState([]);

  useEffect(() => {
    const newSocket = new WebSocket('ws://localhost:3000');

    newSocket.onopen = () => {
      console.log('Connected to server');
    };

    newSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'log':
          setLogs(prev => [...prev, data].slice(-100));
          break;
        case 'manifest':
          setManifestData(data);
          break;
        case 'segment':
          setSegmentData(prev => [...prev, data].slice(-50));
          break;
        default:
          console.log('Unknown message type:', data);
      }
    };

    newSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const startAnalysis = (url) => {
    if (socket) {
      socket.send(JSON.stringify({
        type: 'start-analysis',
        url
      }));
    }
  };

  const stopAnalysis = () => {
    if (socket) {
      socket.send(JSON.stringify({
        type: 'stop-analysis'
      }));
    }
  };

  return (
    <ChakraProvider>
      <Box minH="100vh" bg="gray.50">
        <Header />
        <Container maxW="container.xl" py={8}>
          <VStack spacing={8} align="stretch">
            <ManifestAnalyzer
              onStart={startAnalysis}
              onStop={stopAnalysis}
              manifestData={manifestData}
            />
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={8}>
              <LogViewer logs={logs} />
              <SegmentViewer segments={segmentData} />
            </Box>
          </VStack>
        </Container>
      </Box>
    </ChakraProvider>
  );
}

export default App; 