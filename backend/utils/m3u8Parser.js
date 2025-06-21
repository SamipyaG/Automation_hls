const { Parser } = require('m3u8-parser');

class M3U8Parser {
  static parseMasterPlaylist(content) {
    try {
      const parser = new Parser();
      parser.push(content);
      parser.end();

      const manifest = parser.manifest;

      if (!manifest.playlists || manifest.playlists.length === 0) {
        throw new Error('No playlists found in master manifest');
      }

      const profiles = manifest.playlists.map(playlist => ({
        uri: playlist.uri,
        bandwidth: playlist.attributes.BANDWIDTH,
        resolution: playlist.attributes.RESOLUTION,
        codecs: playlist.attributes.CODECS,
        frameRate: playlist.attributes.FRAME_RATE,
        audio: playlist.attributes.AUDIO,
        video: playlist.attributes.VIDEO,
        subtitles: playlist.attributes.SUBTITLES,
        closedCaptions: playlist.attributes.CLOSED_CAPTIONS
      }));

      console.log(`📋 Parsed master playlist with ${profiles.length} profiles`);
      return profiles;

    } catch (error) {
      console.error('❌ Error parsing master playlist:', error);
      throw new Error(`Failed to parse master playlist: ${error.message}`);
    }
  }

  static parseMediaPlaylist(content) {
    try {
      const parser = new Parser();
      parser.push(content);
      parser.end();

      const manifest = parser.manifest;

      if (!manifest.segments || manifest.segments.length === 0) {
        throw new Error('No segments found in media playlist');
      }

      const result = {
        mediaSequence: manifest.mediaSequence || 0,
        targetDuration: manifest.targetDuration,
        playlistType: manifest.playlistType,
        segments: manifest.segments.map(segment => ({
          uri: segment.uri,
          duration: segment.duration,
          mediaSequence: manifest.mediaSequence || 0,
          discontinuity: segment.discontinuity || false,
          byteRange: segment.byteRange,
          key: segment.key,
          map: segment.map
        }))
      };

      console.log(`📋 Parsed media playlist with ${result.segments.length} segments, mediaSequence: ${result.mediaSequence}`);
      return result;

    } catch (error) {
      console.error('❌ Error parsing media playlist:', error);
      throw new Error(`Failed to parse media playlist: ${error.message}`);
    }
  }

  static resolveUrl(baseUrl, uri) {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }

    if (uri.startsWith('//')) {
      return `https:${uri}`;
    }

    if (uri.startsWith('/')) {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${uri}`;
    }

    // Relative URL
    const baseUrlObj = new URL(baseUrl);
    const pathParts = baseUrlObj.pathname.split('/');
    pathParts.pop(); // Remove filename
    const basePath = pathParts.join('/');

    return `${baseUrlObj.protocol}//${baseUrlObj.host}${basePath}/${uri}`;
  }

  static getBaseUrl(url) {
    const lastSlashIndex = url.lastIndexOf('/');
    return url.substring(0, lastSlashIndex + 1);
  }
}

module.exports = M3U8Parser; 