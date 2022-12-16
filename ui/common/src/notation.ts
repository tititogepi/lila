import { NotationStyle } from 'stratutils';

interface ExtendedMoveInfo {
  san: string;
  uci: string;
  fen: string;
  prevFen?: string; //needed for shogi and oware not xiangqi
}

interface ParsedMove {
  dest: string;
  orig: string;
}

type Board = { pieces: { [key: string]: string }; wMoved: boolean };

export function moveFromNotationStyle(notation: NotationStyle): (move: ExtendedMoveInfo, variant: Variant) => string {
  switch (notation) {
    case 'wxf':
      return xiangqiNotation;
    case 'usi':
      return shogiNotation;
    case 'san':
      return move => (move.san[0] === 'P' ? move.san.slice(1) : move.san);
    case 'uci':
      return move => move.uci;
    case 'dpo':
      return destPosOnlyNotation;
    case 'man':
      return mancalaNotation;
  }
}

/*
 ** reads in a fen and outputs a map of board pieces - coordinates/keys are that of a shogi board [file+rank]
 */
export function readFen(fen: string, ranks: number, files: number) {
  const parts = fen.split(' '),
    board: Board = {
      pieces: {},
      wMoved: parts[1] === 'b',
    };

  parts[0]
    .split('[')[0]
    .split('/')
    .slice(0, ranks)
    .forEach((row, y) => {
      let x = files;
      let promoted = false;
      row.split('').forEach(v => {
        if (v == '~') return;
        const nb = parseInt(v, 10);
        if (nb) x -= nb;
        else if (v == '+') promoted = true;
        else {
          if (promoted) {
            board.pieces[`${x}${y + 1}`] = '+' + v;
          } else {
            board.pieces[`${x}${y + 1}`] = v;
          }
          x--;
          promoted = false;
        }
      });
    });

  return board;
}

function parseUciToUsi(uci: string, files: number, ranks: number): ParsedMove {
  //account for ranks going up to 10, files are just a letter
  const reg = uci.match(/[a-zA-Z][1-9@]0?/g) as string[];
  return {
    orig: parseUCISquareToUSI(reg[0], files, ranks)!,
    dest: parseUCISquareToUSI(reg[1], files, ranks)!,
  };
}

export function parseUCISquareToUSI(str: string, files: number, ranks: number): string | undefined {
  if (str.length > 3) return;
  const file = files - Math.abs(str.charCodeAt(0) - 'a'.charCodeAt(0));
  const rank = ranks + 1 - parseInt(str.slice(1));
  if (file < 1 || file > files || rank < 1 || rank > ranks) return;
  return file.toString() + rank.toString();
}

function shogiNotation(move: ExtendedMoveInfo, variant: Variant): string {
  const parsed = parseUciToUsi(move.uci, variant.boardSize.width, variant.boardSize.height),
    board = readFen(move.fen, variant.boardSize.height, variant.boardSize.width),
    prevBoard = readFen(move.prevFen!, variant.boardSize.height, variant.boardSize.width),
    prevrole = prevBoard.pieces[parsed.orig],
    dest = parsed.dest,
    connector = isCapture(prevBoard, board) ? 'x' : isDrop(prevBoard, board) ? '*' : '-',
    role = board.pieces[dest],
    piece = role[0] === '+' ? role[0] + role[1].toUpperCase() : role[0].toUpperCase(),
    origin = !isDrop(prevBoard, board) && isMoveAmbiguous(board, parsed.dest, prevrole) ? parsed.orig : '', //ToDo ideally calculate this from SAN or in stratops as currently doesn't include illegal moves like piece being pinned or obstruction
    promotion = promotionSymbol(prevBoard, board, parsed);

  if (promotion == '+') return `${piece.slice(1)}${origin}${connector}${dest}${promotion}`;

  return `${piece}${origin}${connector}${dest}${promotion}`;
}

function isMoveAmbiguous(board: Board, dest: string, prevRole: string): boolean {
  const locations: string[] = previousLocationsOfPiece(prevRole, dest);
  const possibleRoles = locations.map(l => board.pieces[l]).filter(x => x != undefined);
  return possibleRoles.includes(prevRole);
}

function previousLocationsOfPiece(role: string, dest: string): string[] {
  // illegal positions will just return nothing from board.piece[l] therefore dont check
  // doesn't account for pins or obstruction
  // dest is file + rank ,each single digit 1-9.
  const sb: string[] = [];
  switch (role) {
    case 'N':
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 2).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 2).toString());
      break; // n-piece (p1)

    case 'n':
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) - 2).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) - 2).toString());
      break; // n-piece (p2)

    case 'S':
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) - 1).toString());
      break; // s-piece (p1)

    case 's':
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 1).toString());
      break; // s-piece (p2)

    case 'b':
    case 'B':
      [1, 2, 3, 4, 5, 6, 7, 8].forEach(i => {
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) - i).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) - i).toString());
      });
      break; // b-piece

    case 'r':
    case 'R':
      [1, 2, 3, 4, 5, 6, 7, 8].forEach(i => {
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) + 0).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) + 0).toString());
        sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - i).toString());
      });
      break; // r-piece

    case '+P':
    case '+L':
    case '+N':
    case '+S':
    case 'G':
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - 1).toString());
      break; // g-piece (p1)

    case '+s':
    case '+n':
    case '+l':
    case '+p':
    case 'g':
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + 1).toString());
      break; // g-piece (p2)

    case '+b':
    case '+B':
      [1, 2, 3, 4, 5, 6, 7, 8].forEach(i => {
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) - i).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) - i).toString());
      });
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 0).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - 1).toString());
      break; // pb-piece

    case '+r':
    case '+R':
      [1, 2, 3, 4, 5, 6, 7, 8].forEach(i => {
        sb.push((parseInt(dest[0]) + i).toString() + (parseInt(dest[1]) + 0).toString());
        sb.push((parseInt(dest[0]) - i).toString() + (parseInt(dest[1]) + 0).toString());
        sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) + i).toString());
        sb.push((parseInt(dest[0]) + 0).toString() + (parseInt(dest[1]) - i).toString());
      });
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) + 1).toString());
      sb.push((parseInt(dest[0]) + 1).toString() + (parseInt(dest[1]) - 1).toString());
      sb.push((parseInt(dest[0]) - 1).toString() + (parseInt(dest[1]) - 1).toString());
      break; // pr-piece

    default:
    //nothing k-piece, p-piece, l-piece
  }
  return sb;
}

function isCapture(prevBoard: Board, board: Board): boolean {
  return Object.keys(prevBoard.pieces).length - Object.keys(board.pieces).length == 1;
}

function isDrop(prevBoard: Board, board: Board): boolean {
  return Object.keys(prevBoard.pieces).length - Object.keys(board.pieces).length == -1;
}

function promotionSymbol(prevBoard: Board, board: Board, parsed: ParsedMove): string {
  // '+' for promoted, '=' for chose not to promote, '' for normal move
  if (isDrop(prevBoard, board)) return '';

  const prevRole = prevBoard.pieces[parsed.orig];
  const currentRole = board.pieces[parsed.dest];

  if (prevRole !== currentRole) return '+';
  if (prevRole.includes('+')) return '';
  if (
    currentRole.toLowerCase() !== 'g' &&
    currentRole.toLowerCase() !== 'k' &&
    ((board.wMoved && ['1', '2', '3'].includes(parsed.dest.slice(1))) ||
      (!board.wMoved && ['7', '8', '9'].includes(parsed.dest.slice(1))))
  ) {
    return '=';
  } else {
    return '';
  }
}

function xiangqiNotation(move: ExtendedMoveInfo, variant: Variant): string {
  const parsed = parseUciToUsi(move.uci, variant.boardSize.width, variant.boardSize.height),
    board = readFen(move.fen, variant.boardSize.height, variant.boardSize.width),
    role = board.pieces[parsed.dest],
    piece = xiangqiRoleToPiece(role),
    //converting to xiangqi from shogi board notation -> ranks: p2=1, p1=10 ; rows: left-right p1 pov, 9-1 for p1, 1-9 p2
    prevFile = board.wMoved ? parseInt(parsed.orig[0]) : variant.boardSize.width + 1 - parseInt(parsed.orig[0]),
    prevRank = parseInt(parsed.orig.slice(1)),
    newFile = board.wMoved ? parseInt(parsed.dest[0]) : variant.boardSize.width + 1 - parseInt(parsed.dest[0]),
    newRank = parseInt(parsed.dest.slice(1)),
    isdiagonalMove = newRank !== prevRank && prevFile !== newFile,
    direction =
      newRank === prevRank
        ? '='
        : (board.wMoved && newRank < prevRank) || (!board.wMoved && newRank > prevRank)
        ? '+'
        : '-',
    movement = direction == '=' || isdiagonalMove ? newFile : Math.abs(newRank - prevRank);

  //Ammend notation due to multiple pawns in row, case 1: pair sideways, case 2: 3 or more up and down and sideways
  if (role === 'p' || role == 'P') {
    const pawnRole = board.wMoved ? 'P' : 'p';
    const addMovedPiece = prevFile !== newFile;
    const pawnRanks = numFriendlyPawnsInColumn(
      parsed.orig[0],
      board,
      variant.boardSize.height,
      pawnRole,
      addMovedPiece,
      prevRank,
      newRank
    );

    if (pawnRanks.length == 2) {
      const pawnOp =
        (pawnRanks.indexOf(prevRank) == 0 && board.wMoved) || (pawnRanks.indexOf(prevRank) == 1 && !board.wMoved)
          ? '+'
          : '-';
      return `${piece}${pawnOp}${direction}${movement}`;
    } else if (pawnRanks.length > 2) {
      const pawnNum = board.wMoved ? pawnRanks.indexOf(prevRank) + 1 : pawnRanks.length - pawnRanks.indexOf(prevRank);
      return `${pawnNum}${prevFile}${direction}${movement}`;
    } else {
      return `${piece}${prevFile}${direction}${movement}`;
    }
  } else {
    return `${piece}${prevFile}${direction}${movement}`;
  }
}

function xiangqiRoleToPiece(role: string) {
  switch (role) {
    case 'n':
    case 'N':
      return 'H';
    case 'b':
    case 'B':
      return 'E';
    default:
      return role.toUpperCase();
  }
}

function numFriendlyPawnsInColumn(
  origFile: string,
  board: Board,
  numRanks: number,
  role: string,
  addMovedPiece: boolean,
  origPieceRank: number,
  newPieceRank: number
): number[] {
  const pawnRanks: number[] = [];
  const ranks = [...Array(numRanks + 1).keys()].slice(1);
  ranks.forEach(r => {
    if (addMovedPiece && r === origPieceRank) pawnRanks.push(origPieceRank); // add the moved piece in this position to avoid sorting
    const piece = board.pieces[origFile + r.toString()];
    if (piece === role) {
      if (!addMovedPiece && r === newPieceRank) {
        pawnRanks.push(origPieceRank); // add moved pawn in original position in order to acquire its index from prev position
      } else {
        pawnRanks.push(r);
      }
    }
  });
  return pawnRanks;
}

function destPosOnlyNotation(move: ExtendedMoveInfo, variant: Variant): string {
  if (!move.uci.includes('@')) return 'PASS';

  const reg = move.uci.match(/[a-zA-Z][1-9@]0?/g) as string[];
  const dest = reg[1];

  //convert into flipello notation - a1 is top left for first player (not bottom left)
  const newRank = variant.boardSize.height + 1 - parseInt(dest.slice(1));
  const destPos = dest[0] + newRank;

  return `${destPos}`;
}

function mancalaNotation(move: ExtendedMoveInfo, variant: Variant): string {
  const reg = move.uci.match(/[a-z][1-2]/g) as string[];
  const orig = reg[0];
  const origLetter =
    orig[1] === '1'
      ? orig[0].toUpperCase()
      : nextAsciiLetter(orig[0], (96 - orig.charCodeAt(0)) * 2 + variant.boardSize.width + 1);
  //captured number of stones
  const scoreDiff =
    getOwareScore(move.fen, 'p1') +
    getOwareScore(move.fen, 'p2') -
    getOwareScore(move.prevFen!, 'p1') -
    getOwareScore(move.prevFen!, 'p2');
  const scoreText = scoreDiff <= 0 ? '' : ` + ${scoreDiff}`;
  return `${origLetter}${scoreText}`;
}

function nextAsciiLetter(letter: string, n: number): string {
  return String.fromCharCode(letter.charCodeAt(0) + n);
}

export function getOwareScore(fen: string, playerIndex: string): number {
  const pIndex = playerIndex === 'p1' ? 1 : 2;
  const asciiNum = fen.split(' ')[pIndex].charCodeAt(0);
  if (asciiNum == 48) return 0;
  return asciiNum > 90 ? asciiNum - 70 : asciiNum - 64;
}
