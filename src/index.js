
/**********************************/
/**** Coordinate File Decoders ****/

class LineDelimitedJsonArrayCoordinateDecoder {
    decode(inputString) {
        const geometry = inputString.split("\n")
            // Only process non-empty (and non-trivial - []) lines
            .filter(line => line.length > 2)
            .map(line => JSON.parse(line));

        if(!geometry.every(row => row.length === 3 && row.every(x => typeof x === "number"))) {
            throw "Provided text should be line-separated JSON representations of 3-element X,Y,Z arrays."
        }

        Object.freeze(geometry);
        return geometry;
    }
}

class JsonArrayCoordinateDecoder {
    decode(inputString) {
        const geometry = JSON.parse(inputString);
        if(!(geometry.length >= 1) || geometry.every(row => row.length === 3 && row.every(x => typeof x === "number"))) {
            throw "Provided JSON must represent an array containing 3-element X,Y,Z arrays.";
        }
        
        Object.freeze(geometry);
        return geometry;
    }
}

/**
 * Primitive CSV decoder. Does not handle escaping, suitable for simple files containing only integer data.
 */
 class CsvCoordinateDecoder {
    constructor({
        xyzColumns = [0, 1, 2],
        skipRowCount = 0,
        validationMaxColumns = 10,
    } = {}) {
        this.xyzColumns = xyzColumns;
        this.skipRowCount = skipRowCount;
        this.validationMaxColumns = validationMaxColumns; 
        if(this.xyzColumns.length !== 3) {
            throw "xyzColumns should contain 3 integers corresponding to X, Y and Z column numbers (0-based)."
        }
    }

    decode(inputString) {
        const lines = inputString.split("\n");
        if(this.skipRowCount > 0) {
            lines.splice(0, this.skipRowCount); // remove first N lines
        }

        // Field indexes for respective columns (extracted for clarity)
        const fieldX = this.xyzColumns[0];
        const fieldY = this.xyzColumns[1];
        const fieldZ = this.xyzColumns[2];

        const highestFieldIndex = Math.max(fieldX, fieldY, fieldZ);

        if(lines.some(line => line.replace(/[^,]/g, '').length >= this.validationMaxColumns)) {
            throw `Selected coordinate CSV file has more than ${this.validationMaxColumns} columns! Rejecting.`;
        }
        
        const geometry = lines
            // Split by comma
            .map(ln => ln.trim().split(','))
            // Only process lines with enough fields to read the last coordinate column
            .filter(fields => fields.length > highestFieldIndex)
            // Map the line to [x, y, z] array
            .map(fields => [fields[fieldX], fields[fieldY], fields[fieldZ]].map(c => parseFloat(c)));
        
        Object.freeze(geometry)
        return geometry;
    }
}


/****************************/
/**** Coordinate Mapping ****/

class CoordinateMapping {
    constructor(decoder) {
        this.mapping = [];
        this.decoder = decoder;
    }

    load(data) {
        this.mapping = this.decoder.decode(data);
    }

    idxToCoord(idx, defaultValue = null) {
        if(idx < 0 || idx >= this.mapping.length) {
            return defaultValue;
        }
        return this.mapping[idx];
    }

    allCoords() {
        return this.mapping;
    }
}


/************************************/
/**** Animation CSV File Decoder ****/

/**
 * Primitive CSV decoder. Does not handle escaping, suitable for simple files containing only integer data.
 */
 class CsvAnimationDecoder {
    constructor({
        skipRowCount = 0,
        components = ["r", "g", "b"],
        outputHexColors = false,
        customPixelMapper = null,
        customFrameMapper = null,
    } = {}) {
        this.skipRowCount = skipRowCount;
        this.components = new Map();
        this.pixelMapper = outputHexColors 
                ? rgb => '#' + rgb
                    .map(c => c.toString(16))
                    .map(c => c.length < 2 ? `0${c}` : c)
                    .join('') 
                : rgb => rgb;

        if(customPixelMapper) {
            if(outputHexColors) {
                const hexPixelMapper = this.pixelMapper;
                this.pixelMapper = rgb => customPixelMapper(hexPixelMapper(rgb));
            }else{
                this.pixelMapper = rgb => customPixelMapper(rgb);
            }
        }

        this.frameMapper = customFrameMapper ? customFrameMapper : pixels => pixels;

        components.forEach((c, idx) => this.components.set(c, idx));
    }

    decodeHeadingRow(line) {
        const fields = line.toLowerCase().split(',');
        const columnMapping = [];
        fields.forEach((field, idx) => {
            const parts = field.split("_");
            if(parts.length !== 2 || !this.components.has(parts[0])) {
                return; // skip other fields
            }
            const [component, pixelIndexStr] = parts;
            const pixelIndex = parseInt(pixelIndexStr, 10);
            columnMapping[idx] = {
                component,
                pixel: pixelIndex
            };
        });

        return {
            totalColumnCount: fields.length,
            columnMapping
        };
    }

    decode(inputString) {
        const lines = inputString.split("\n");
        if(this.skipRowCount > 0) {
            lines.splice(0, this.skipRowCount); // remove first N lines
        }

        const {
            columnMapping,
            totalColumnCount
        } = this.decodeHeadingRow(lines.splice(0, 1)[0]);

        const frame = lines
            // Split by comma
            .map(ln => ln.split(','))
            // Only process lines with enough fields corresponding to heading labels
            .filter(fields => fields.length >= totalColumnCount)
            // Map the line
            .map(fields => {
                const pixels = [];
                for(let columnIndex = 0; columnIndex < totalColumnCount; columnIndex++) {
                    const mapping = columnMapping[columnIndex];
                    if(!mapping) continue; // ignore non-mapped columns
                    const { component, pixel: pixelIdx } = mapping;
                    const pixelObj = pixels[pixelIdx] || [];
                    pixelObj[this.components.get(component)] = parseFloat(fields[columnIndex]);
                    pixels[pixelIdx] = pixelObj;
                }
                return pixels;
            })
            .map(line => line.map(this.pixelMapper))
            .map(this.frameMapper);

        Object.freeze(frame);

        return frame;
    }
}

/**************************************/
/**** Real-time simulation manager ****/

class ChristmasTreeSimulator {
    constructor({
        startPlaying = false,
        startTime = 0,
        inititalPlaybackRate = 1,
        baseFrameRate = 60,
    } = {}) {
        this._currentTime = null;
        this.currentTime = startTime;
        this.inititalPlaybackRate = inititalPlaybackRate;
        this.playbackRate = inititalPlaybackRate;
        this.baseFrameRate = baseFrameRate;
        this.isPlaying = startPlaying;
        this.startPlaying = startPlaying;
        this.dirty = true; // requires re-render if true
        this.dirtyGeometry = true; // geometry needs updating if true

        this.animationFrames = [];
        this.coordinateMapping = null;
    }

    get frameCount() {
        return this.animationFrames.length;
    }

    get frameDuration() {
        return 1 / this.baseFrameRate;
    }

    get duration() {
        return Math.max(1e-9, this.frameCount * this.frameDuration);
    }
    
    get currentTime() {
        return this._currentTime % this.duration;
    }

    set currentTime(val) {
        if(val < 0) {
            val = val % this.duration;
            val += this.duration;
        }
        this._currentTime = val;
        this.dirty = true;
    }

    get currentFrameIdx() {
        return Math.floor(this.currentTime / this.frameDuration) % this.frameCount;
    }

    get currentProgress() {
        return this.currentFrameIdx / this.frameCount;
    }

    set currentProgress(progress) {
        this.currentTime = Math.floor(progress * this.frameCount) * this.frameDuration;
    }

    getCurrentFrameMapped() {
        const frame = this.animationFrames[this.currentFrameIdx];
        return frame.map((pixel, idx) => ({
            position: this.coordinateMapping.idxToCoord(idx),
            color: pixel
        }));
    }

    resetPlayback({
        startPlaying = undefined,
        playbackRate = undefined,
        baseFrameRate = undefined,
        startTime = 0,
    } = {}) {
        if(startPlaying !== undefined) this.isPlaying = startPlaying; else this.isPlaying = this.startPlaying;
        if(playbackRate !== undefined) this.playbackRate = playbackRate; else this.playbackRate = this.inititalPlaybackRate;
        if(baseFrameRate !== undefined) this.baseFrameRate = baseFrameRate;
        this.currentTime = startTime;
    }

    setData({
        animationFrames = undefined,
        coordinateMapping = undefined,
    }) {
        if(animationFrames != undefined) {
            this.animationFrames = animationFrames;
        }
        if(coordinateMapping != undefined) {
            this.coordinateMapping = coordinateMapping;
            this.dirtyGeometry = true;
        }
        this.currentTime = 0;
    }

    clearDirty() {
        const ret = this.dirty;
        this.dirty = false;
        return ret;
    }

    clearGeometryDirty() {
        const ret = this.dirtyGeometry;
        this.dirtyGeometry = false;
        return ret;
    }

    processTimeAdvance(deltaTime) {
        if(this.isPlaying) {
            const scaledDelta = deltaTime * this.playbackRate;
            this.seekRelative(scaledDelta);
        }
    }

    seekRelative(deltaTime) {
        this.currentTime += deltaTime;
    }

    setPlaybackRate(rate = 1) {
        if(this.playbackRate !== rate) {
            this.playbackRate = rate;
        }
    }
}

module.exports = {
    CoordinateDecoders: {
        LineDelimitedJsonArrayCoordinateDecoder,
        JsonArrayCoordinateDecoder,
        CsvCoordinateDecoder,
    },
    CsvAnimationDecoder,
    CoordinateMapping,
    ChristmasTreeSimulator,
};
