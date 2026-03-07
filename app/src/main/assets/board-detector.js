'use strict';
// ============================================================
// Board Detector — reads chess board screenshots via canvas
// pixel analysis. Supports Chess.com and Lichess color schemes.
// ============================================================
const BD = (() => {

// Known board color palettes
const PALETTES = [
    {
        name: 'chess.com-green',
        light: {r:238,g:238,b:210},
        dark:  {r:118,g:150,b:86},
        hlLight:{r:246,g:246,b:105},
        hlDark: {r:186,g:202,b:43}
    },
    {
        name: 'chess.com-brown',
        light: {r:240,g:217,b:181},
        dark:  {r:181,g:136,b:99},
        hlLight:{r:205,g:210,b:106},
        hlDark: {r:170,g:162,b:58}
    },
    {
        name: 'lichess-blue',
        light: {r:240,g:217,b:181},
        dark:  {r:181,g:136,b:99},
        hlLight:{r:205,g:210,b:106},
        hlDark: {r:170,g:162,b:58}
    },
    {
        name: 'lichess-green',
        light: {r:234,g:233,b:210},
        dark:  {r:115,g:149,b:82},
        hlLight:{r:205,g:210,b:106},
        hlDark: {r:170,g:162,b:58}
    }
];

function colorDist(a, b) {
    const dr=a.r-b.r, dg=a.g-b.g, db=a.b-b.b;
    return Math.sqrt(dr*dr+dg*dg+db*db);
}

function samplePixel(data, x, y, w) {
    const i=(y*w+x)*4;
    return {r:data[i],g:data[i+1],b:data[i+2]};
}

// Detect the board region by scanning for alternating square colors
function findBoardRegion(imgData, imgW, imgH) {
    const {data} = imgData;
    let bestScore=0, bestRegion=null;

    // Try several board sizes and positions
    const minSize = Math.min(imgW,imgH)*0.3;
    const maxSize = Math.min(imgW,imgH)*0.98;
    const step    = Math.floor(Math.min(imgW,imgH)*0.05);

    for (let size=Math.floor(maxSize); size>=minSize; size-=step) {
        for (let ox=0; ox<=imgW-size; ox+=step) {
            for (let oy=0; oy<=imgH-size; oy+=step) {
                const sq=Math.floor(size/8);
                if(sq<4) continue;
                let score=0;
                // Sample corners of each square
                for(let r=0;r<8;r+=2) {
                    for(let f=0;f<8;f+=2) {
                        const x=ox+f*sq+sq/2, y=oy+r*sq+sq/2;
                        const px=samplePixel(data,Math.floor(x),Math.floor(y),imgW);
                        // Light square expected at even r+f
                        const isLightExpected=(r+f)%2===0;
                        const lum=0.299*px.r+0.587*px.g+0.114*px.b;
                        if(isLightExpected&&lum>150) score++;
                        else if(!isLightExpected&&lum<130) score++;
                    }
                }
                if(score>bestScore) {
                    bestScore=score; bestRegion={x:ox,y:oy,size};
                }
            }
        }
    }
    return bestScore>=10 ? bestRegion : null;
}

// Identify which color palette the board uses
function identifyPalette(imgData, region) {
    const {data}=imgData, {x,y,size}=region;
    const sq=Math.floor(size/8);
    let bestPalette=PALETTES[0], bestErr=Infinity;
    for(const pal of PALETTES) {
        let err=0, count=0;
        for(let r=0;r<8;r++){
            for(let f=0;f<8;f++){
                const px=samplePixel(data,
                    Math.floor(x+f*sq+sq/2),
                    Math.floor(y+r*sq+sq/2),
                    imgData.width);
                const expected=(r+f)%2===0 ? pal.light : pal.dark;
                err+=colorDist(px,expected); count++;
            }
        }
        if(err/count<bestErr){bestErr=err/count;bestPalette=pal;}
    }
    return bestPalette;
}

// Determine orientation: is a1 at bottom-left or top-left?
// We check if rank 1 (expected white pawns/pieces) is at bottom or top
function detectOrientation(imgData, region, palette) {
    const {data}=imgData, {x,y,size}=region;
    const sq=Math.floor(size/8);
    let bottomLum=0, topLum=0;
    for(let f=0;f<8;f++){
        const bPx=samplePixel(data,Math.floor(x+f*sq+sq/2),Math.floor(y+7*sq+sq/2),imgData.width);
        const tPx=samplePixel(data,Math.floor(x+f*sq+sq/2),Math.floor(y+0*sq+sq/2),imgData.width);
        bottomLum+=0.299*bPx.r+0.587*bPx.g+0.114*bPx.b;
        topLum   +=0.299*tPx.r+0.587*tPx.g+0.114*tPx.b;
    }
    // Higher luminance = lighter pieces (white) more likely
    return bottomLum > topLum ? 'normal' : 'flipped'; // normal = white at bottom
}

// Classify a single square's pixel as empty, white-piece, or black-piece
function classifySquare(px, squareColor, palette) {
    const squareRef = squareColor==='light' ? palette.light : palette.dark;
    const dist=colorDist(px,squareRef);
    if(dist<25) return 'empty';
    const lum=0.299*px.r+0.587*px.g+0.114*px.b;
    // White pieces are bright (high luminance), black pieces are dark
    if(lum>160) return 'white';
    if(lum<80)  return 'black';
    return 'empty'; // intermediate, treat as empty
}

// Very rough piece-type heuristic based on brightness variation within a square
function guessPieceType(imgData, region, row, file, palette) {
    const {data}=imgData, {x,y,size}=region;
    const sq=Math.floor(size/8);
    const ox=Math.floor(x+file*sq), oy=Math.floor(y+row*sq);
    // Sample a 5x5 grid inside the square
    let samples=[], lums=[];
    const n=5;
    for(let i=0;i<n;i++){
        for(let j=0;j<n;j++){
            const px2=samplePixel(data,Math.floor(ox+sq*(i+1)/(n+1)),Math.floor(oy+sq*(j+1)/(n+1)),imgData.width);
            samples.push(px2);
            lums.push(0.299*px2.r+0.587*px2.g+0.114*px2.b);
        }
    }
    const sqColor=(row+file)%2===0?'light':'dark';
    const ref=sqColor==='light'?palette.light:palette.dark;
    // Count non-background pixels
    let piecePixels=0;
    for(const px2 of samples) if(colorDist(px2,ref)>20) piecePixels++;
    const density=piecePixels/(n*n);

    // Heuristic: density correlates with piece size
    // King/Queen > Rook > Bishop/Knight > Pawn
    if(density<0.15) return 'P';
    if(density<0.30) return 'N'; // or B — can't distinguish well without ML
    if(density<0.45) return 'B';
    if(density<0.60) return 'R';
    if(density<0.80) return 'Q';
    return 'K';
}

// Main entry: given a canvas ImageData, return a best-effort FEN string
// confidence: 0-1 score of how confident the detection is
function detectFromImageData(imgData) {
    const result = { fen: null, region: null, palette: null, confidence: 0, message: '' };

    const region = findBoardRegion(imgData, imgData.width, imgData.height);
    if (!region) {
        result.message = 'No chessboard detected in image';
        return result;
    }
    result.region = region;

    const palette = identifyPalette(imgData, region);
    result.palette = palette.name;

    const orientation = detectOrientation(imgData, region, palette);
    const flipped = orientation==='flipped';

    const {data}=imgData, {x,y,size}=region;
    const sq=Math.floor(size/8);

    // Build board array [rank8..rank1][fileA..fileH]
    // board[r][f] where r=0 is rank 8, r=7 is rank 1
    const boardArr=[];
    for(let row=0;row<8;row++){
        boardArr.push([]);
        for(let file=0;file<8;file++){
            // Sample center pixel
            const px=samplePixel(data,
                Math.floor(x+file*sq+sq/2),
                Math.floor(y+row*sq+sq/2),
                imgData.width);
            const sqColor=(row+file)%2===0?'light':'dark';
            const cls=classifySquare(px,sqColor,palette);
            let piece='.';
            if(cls!=='empty'){
                const pType=guessPieceType(imgData,region,row,file,palette);
                piece=cls==='white'?pType:pType.toLowerCase();
            }
            boardArr[row].push(piece);
        }
    }

    // If flipped, reverse the board
    if(flipped){
        boardArr.reverse();
        for(const row of boardArr) row.reverse();
    }

    // Build FEN
    let fen='';
    for(let r=0;r<8;r++){
        let empty=0;
        for(let f=0;f<8;f++){
            const p=boardArr[r][f];
            if(p==='.'){empty++;}
            else{if(empty){fen+=empty;empty=0;}fen+=p;}
        }
        if(empty)fen+=empty;
        if(r<7)fen+='/';
    }
    // Default to white to move — user can correct
    fen+=' w KQkq - 0 1';
    result.fen=fen;
    result.confidence=0.6; // honest: piece-type detection is approximate
    result.message='Board detected ('+palette.name+'). Piece types are estimated — please verify.';
    return result;
}

// Wrapper: load image URL into an offscreen canvas, then detect
function detectFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                resolve(detectFromImageData(imgData));
            } catch(e) {
                reject(new Error('Cannot read image pixels: '+e.message));
            }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}

return { detectFromDataUrl, detectFromImageData };
})();
