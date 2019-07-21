const { transformFrames, getFrameRange } = require('./utils');

class FilterTempo {
  constructor({ detectSceneChange = true } = {}) {
    this.detectSceneChange = detectSceneChange;
  }

  get name() {
    return 'tempo';
  }

  async apply(file) {
    const { start, end } = await getFrameRange(file, this.detectSceneChange);
    await transformFrames(file, null, false, image => {
      for (let i = start; i <= end; i += 2) {
        delete image.frames[i];
      }
      return image;
    });
  }
}

module.exports = FilterTempo;