# HLS Automation Dashboard

A real-time HLS (HTTP Live Streaming) analysis dashboard built with Node.js, Express, Socket.IO, and vanilla JavaScript. This application provides comprehensive monitoring and analysis of HLS streams with a beautiful, modern UI.

## 🚀 Features

- **Real-time HLS Monitoring**: Live analysis of HLS manifests and segments
- **Profile Selection**: Interactive profile selection for multi-bitrate streams
- **Beautiful UI**: Modern, responsive design with smooth animations
- **Header Analysis**: Detailed HTTP header inspection for requests
- **Segment Tracking**: Real-time segment analysis with download times
- **Video Player**: Integrated HLS.js video player for stream playback
- **Error Detection**: Automatic detection of media sequence jumps and discontinuities

## 📁 Project Structure

```
Automation_HLS/
├── backend/                 # Backend application
│   ├── controllers/         # Business logic controllers
│   │   └── streamController.js
│   ├── routes/             # API routes
│   │   └── streamRoutes.js
│   ├── services/           # Core services
│   │   └── hlsMonitorService.js
│   ├── socket/             # Socket.IO handlers
│   │   └── socketHandler.js
│   ├── utils/              # Utility functions
│   │   └── m3u8Parser.js
│   ├── app.js              # Express application setup
│   └── server.js           # Server entry point
├── public/                 # Frontend assets
│   ├── index.html          # Main HTML file
│   ├── app.js              # Frontend JavaScript
│   └── style.css           # Styles and animations
├── cache/                  # Temporary cache directory
├── package.json            # Dependencies and scripts
└── README.md              # Project documentation
```

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Automation_HLS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Access the dashboard**
   - Open your browser and navigate to `http://localhost:5000`
   - The dashboard will be available with real-time HLS monitoring capabilities

## 🔧 Development

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon

### Backend Architecture

The backend follows a clean architecture pattern:

- **Controllers**: Handle business logic and coordinate between services
- **Services**: Core functionality for HLS monitoring and analysis
- **Routes**: API endpoints for status and health checks
- **Socket Handlers**: Real-time communication with the frontend
- **Utils**: Helper functions for M3U8 parsing and URL resolution

### Frontend Architecture

The frontend is built with vanilla JavaScript and includes:

- **Real-time Updates**: Socket.IO integration for live data
- **HLS.js Integration**: Video player for stream playback
- **Modern UI**: Beautiful, responsive design with CSS animations
- **Modal System**: Interactive modals for header and manifest inspection

## 📊 API Endpoints

- `GET /api/status` - Server status and health information
- `GET /api/streams` - Active stream information
- `GET /api/health` - Health check endpoint

## 🔌 Socket.IO Events

### Client to Server
- `start-monitor` - Start HLS stream monitoring
- `select-profile` - Select a specific profile for monitoring
- `stop-monitor` - Stop stream monitoring

### Server to Client
- `manifestData` - Manifest analysis data
- `segmentData` - Segment analysis data
- `profiles-available` - Available stream profiles
- `profile-selected` - Profile selection confirmation
- `monitor-started` - Monitoring start confirmation
- `monitor-stopped` - Monitoring stop confirmation
- `error` - Error notifications

## 🎨 UI Features

- **Gradient Backgrounds**: Beautiful purple gradient design
- **Smooth Animations**: CSS transitions and keyframe animations
- **Modal System**: Elegant modal dialogs for detailed information
- **Responsive Design**: Works on desktop and mobile devices
- **Icon Integration**: Font Awesome icons throughout the interface
- **Real-time Status**: Connection status indicator

## 🔍 HLS Analysis Features

- **Master Manifest Parsing**: Automatic detection of available profiles
- **Child Manifest Monitoring**: Real-time monitoring of selected profiles
- **Segment Analysis**: Detailed analysis of each segment
- **Header Inspection**: Complete HTTP header analysis
- **Performance Metrics**: Download times and size tracking
- **Error Detection**: Automatic detection of streaming issues

## 🚀 Usage

1. **Enter HLS URL**: Input a valid HLS stream URL (.m3u8)
2. **Select Profile**: Choose from available quality profiles
3. **Monitor Stream**: View real-time manifest and segment data
4. **Inspect Headers**: Click "Show Headers" to view HTTP headers
5. **Watch Video**: Use the integrated video player for playback

## 🛡️ Error Handling

The application includes comprehensive error handling:

- **Connection Errors**: Automatic reconnection with Socket.IO
- **Stream Errors**: Graceful handling of HLS parsing errors
- **Network Errors**: Timeout and retry mechanisms
- **User Feedback**: Clear error messages and status indicators

## 📝 Code Quality

The codebase has been cleaned and optimized:

- **Removed Unused Code**: Eliminated duplicate and unused functions
- **Improved Structure**: Clean separation of concerns
- **Enhanced Error Handling**: Comprehensive error management
- **Better Documentation**: Clear code comments and structure
- **Optimized Performance**: Efficient data processing and caching

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For issues and questions:
1. Check the console for error messages
2. Verify your HLS URL is accessible
3. Ensure all dependencies are installed
4. Check network connectivity

---

**Built with ❤️ for HLS stream analysis and monitoring** 