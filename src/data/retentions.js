import { IPL_PLAYERS } from './players.js';
import { TEAMS } from './teams.js';
import { toFiniteNumber, r2 } from '../lib/auctionDisplay.js';

export const TOTAL_MEGA_PURSE = 150.0;
export const MAX_RETENTIONS_AND_RTM = 6;

/**
 * Official IPL 2025 Retentions for each of the 10 franchises.
 * Values are in ₹ Crores.
 */
export const OFFICIAL_RETENTIONS = {
  CSK: [
    { id: 'p_130', cost: 18.0, isUncapped: false }, // Ruturaj Gaikwad
    { id: 'p_126', cost: 18.0, isUncapped: false }, // Ravindra Jadeja
    { id: 'p_296', cost: 13.0, isUncapped: false }, // Matheesha Pathirana (OS)
    { id: 'p_134', cost: 12.0, isUncapped: false }, // Shivam Dube
    { id: 'p_120', cost: 4.0,  isUncapped: true },  // MS Dhoni (Uncapped)
  ],
  MI: [
    { id: 'p_621', cost: 18.0,  isUncapped: false }, // Jasprit Bumrah
    { id: 'p_622', cost: 16.35, isUncapped: false }, // Suryakumar Yadav
    { id: 'p_104', cost: 16.35, isUncapped: false }, // Hardik Pandya
    { id: 'p_129', cost: 16.30, isUncapped: false }, // Rohit Sharma
    { id: 'p_166', cost: 8.0,   isUncapped: false }, // Tilak Varma
  ],
  RCB: [
    { id: 'p_142', cost: 21.0, isUncapped: false }, // Virat Kohli
    { id: 'p_158', cost: 11.0, isUncapped: false }, // Rajat Patidar
    { id: 'p_203', cost: 5.0,  isUncapped: true },  // Yash Dayal (Uncapped)
  ],
  SRH: [
    { id: 'p_105', cost: 23.0, isUncapped: false }, // Heinrich Klaasen (OS)
    { id: 'p_123', cost: 18.0, isUncapped: false }, // Pat Cummins (OS)
    { id: 'p_146', cost: 14.0, isUncapped: false }, // Abhishek Sharma
    { id: 'p_139', cost: 14.0, isUncapped: false }, // Travis Head (OS)
    { id: 'p_196', cost: 6.0,  isUncapped: false }, // Nitish Kumar Reddy
  ],
  KKR: [
    { id: 'p_127', cost: 13.0, isUncapped: false }, // Rinku Singh
    { id: 'p_141', cost: 12.0, isUncapped: false }, // Varun Chakaravarthy
    { id: 'p_137', cost: 12.0, isUncapped: false }, // Sunil Narine (OS)
    { id: 'p_623', cost: 12.0, isUncapped: false }, // Andre Russell (OS)
    { id: 'p_190', cost: 4.0,  isUncapped: true },  // Harshit Rana (Uncapped)
    { id: 'p_250', cost: 4.0,  isUncapped: true },  // Ramandeep Singh (Uncapped)
  ],
  RR: [
    { id: 'p_132', cost: 18.0, isUncapped: false }, // Sanju Samson
    { id: 'p_144', cost: 18.0, isUncapped: false }, // Yashasvi Jaiswal
    { id: 'p_159', cost: 14.0, isUncapped: false }, // Riyan Parag
    { id: 'p_150', cost: 14.0, isUncapped: false }, // Dhruv Jurel
    { id: 'p_133', cost: 11.0, isUncapped: false }, // Shimron Hetmyer (OS)
    { id: 'p_198', cost: 4.0,  isUncapped: true },  // Sandeep Sharma (Uncapped)
  ],
  DC: [
    { id: 'p_102', cost: 16.50, isUncapped: false }, // Axar Patel
    { id: 'p_112', cost: 13.25, isUncapped: false }, // Kuldeep Yadav
    { id: 'p_167', cost: 10.0,  isUncapped: false }, // Tristan Stubbs (OS)
    { id: 'p_206', cost: 4.0,   isUncapped: true },  // Abishek Porel (Uncapped)
  ],
  GT: [
    { id: 'p_125', cost: 18.0, isUncapped: false }, // Rashid Khan (OS)
    { id: 'p_136', cost: 16.5, isUncapped: false }, // Shubman Gill
    { id: 'p_162', cost: 8.5,  isUncapped: false }, // Sai Sudharsan
    { id: 'p_185', cost: 4.0,  isUncapped: true },  // Rahul Tewatia (Uncapped)
    { id: 'p_200', cost: 4.0,  isUncapped: true },  // Shahrukh Khan (Uncapped)
  ],
  LSG: [
    { id: 'p_121', cost: 21.0, isUncapped: false }, // Nicholas Pooran (OS)
    { id: 'p_304', cost: 11.0, isUncapped: false }, // Ravi Bishnoi
    { id: 'p_155', cost: 11.0, isUncapped: false }, // Mayank Yadav
    { id: 'p_237', cost: 4.0,  isUncapped: true },  // Mohsin Khan (Uncapped)
    { id: 'p_218', cost: 4.0,  isUncapped: true },  // Ayush Badoni (Uncapped)
  ],
  PBKS: [
    { id: 'p_254', cost: 5.5, isUncapped: true }, // Shashank Singh (Uncapped)
    { id: 'p_243', cost: 4.0, isUncapped: true }, // Prabhsimran Singh (Uncapped)
  ],
};

/**
 * 2024 Franchise mapping for RTM (Right To Match) eligibility.
 * If a player under the hammer played for this team in 2024, that team can exercise RTM.
 */
export const PLAYER_PREVIOUS_TEAM = {
  // Marquee & Key Stars
  'p_101': 'PBKS', // Arshdeep Singh
  'p_103': 'SRH',  // Bhuvneshwar Kumar
  'p_106': 'MI',   // Ishan Kishan
  'p_107': 'MI',   // Jofra Archer
  'p_108': 'RR',   // Jos Buttler
  'p_109': 'RCB',  // Josh Hazlewood
  'p_110': 'PBKS', // Kagiso Rabada
  'p_111': 'LSG',  // KL Rahul
  'p_114': 'SRH',  // Marco Jansen
  'p_115': 'LSG',  // Marcus Stoinis
  'p_116': 'DC',   // Mitch Marsh
  'p_117': 'KKR',  // Mitchell Starc
  'p_118': 'GT',   // Mohammed Shami
  'p_119': 'RCB',  // Mohammed Siraj
  'p_122': 'GT',   // Noor Ahmad
  'p_124': 'KKR',  // Phil Salt
  'p_128': 'DC',   // Rishabh Pant
  'p_131': 'PBKS', // Sam Curran
  'p_135': 'KKR',  // Shreyas Iyer
  'p_138': 'MI',   // Tim David
  'p_140': 'RR',   // Trent Boult
  'p_145': 'RR',   // Yuzvendra Chahal
  'p_147': 'RCB',  // Glenn Maxwell
  'p_149': 'CSK',  // Deepak Chahar
  'p_165': 'SRH',  // T Natarajan
  'p_168': 'SRH',  // Washington Sundar
  'p_272': 'GT',   // David Miller
  'p_279': 'PBKS', // Liam Livingstone
  'p_280': 'CSK',  // Rachin Ravindra
  'p_281': 'KKR',  // Venkatesh Iyer
  'p_289': 'LSG',  // Quinton De Kock
};

/**
 * Returns the set of all retained player IDs across all 10 franchises.
 */
export const ALL_RETAINED_PLAYER_IDS = new Set(
  Object.values(OFFICIAL_RETENTIONS).flatMap((list) => list.map((item) => item.id))
);

/**
 * Returns the list of retained player objects for a specific franchise,
 * fully populated with player bio/stats and retention price.
 */
export function getTeamRetainedSquad(teamId) {
  const retentions = OFFICIAL_RETENTIONS[teamId] || [];
  return retentions.map((item) => {
    const player = IPL_PLAYERS.find((p) => p.id === item.id) || {
      id: item.id,
      name: 'Retained Star',
      role: 'All-Rounder',
      country: 'IND',
      basePrice: item.cost,
    };
    return {
      ...player,
      soldPrice: item.cost,
      retentionCost: item.cost,
      isRetained: true,
      retainedAt: item.cost,
      teamId,
    };
  });
}

/**
 * Calculates initial starting financial/squad state for a team with retentions.
 */
export function getTeamInitialState(teamId, totalBudget = TOTAL_MEGA_PURSE) {
  const squad = getTeamRetainedSquad(teamId);
  const spent = r2(squad.reduce((sum, p) => sum + (p.retentionCost || 0), 0));
  const budgetRemaining = r2(Math.max(0, toFiniteNumber(totalBudget, TOTAL_MEGA_PURSE) - spent));
  const rtmCards = Math.max(0, MAX_RETENTIONS_AND_RTM - squad.length);

  return {
    squad,
    squadCount: squad.length,
    spent,
    budgetRemaining,
    rtmCards,
  };
}

/**
 * Returns previous 2024 franchise ID for a player, if any.
 */
export function getPlayerPreviousTeam(playerOrId) {
  const id = typeof playerOrId === 'string' ? playerOrId : playerOrId?.id;
  if (!id) return null;
  return PLAYER_PREVIOUS_TEAM[id] || null;
}

/**
 * Returns candidate players eligible for retention for a specific franchise,
 * populated with their official retention cost and player stats.
 */
export function getRetentionCandidates(teamId) {
  const retentions = OFFICIAL_RETENTIONS[teamId] || [];
  return retentions.map((item) => {
    const player = IPL_PLAYERS.find((p) => p.id === item.id) || {
      id: item.id,
      name: 'Franchise Star',
      role: 'All-Rounder',
      country: 'IND',
      basePrice: item.cost,
    };
    return {
      ...player,
      cost: item.cost,
      retentionCost: item.cost,
      isUncapped: Boolean(item.isUncapped),
    };
  });
}

/**
 * Calculates financial/squad state for a team based on user-selected player IDs.
 * If selectedPlayerIds is null, defaults to full official list.
 */
export function getCustomTeamRetainedState(teamId, selectedPlayerIds = null, totalBudget = TOTAL_MEGA_PURSE) {
  const candidates = getRetentionCandidates(teamId);
  const selectedList = selectedPlayerIds === null
    ? candidates
    : candidates.filter((p) => selectedPlayerIds.includes(p.id));

  const squad = selectedList.map((p) => ({
    ...p,
    soldPrice: p.cost,
    retentionCost: p.cost,
    isRetained: true,
    retainedAt: p.cost,
    teamId,
  }));

  const spent = r2(squad.reduce((sum, p) => sum + (p.retentionCost || 0), 0));
  const budgetRemaining = r2(Math.max(0, toFiniteNumber(totalBudget, TOTAL_MEGA_PURSE) - spent));
  const rtmCards = Math.max(0, MAX_RETENTIONS_AND_RTM - squad.length);

  return {
    squad,
    squadCount: squad.length,
    spent,
    budgetRemaining,
    rtmCards,
  };
}

/**
 * Check if a player is in the retained list.
 */
export function isPlayerRetained(playerOrId) {
  const id = typeof playerOrId === 'string' ? playerOrId : playerOrId?.id;
  return ALL_RETAINED_PLAYER_IDS.has(id);
}
