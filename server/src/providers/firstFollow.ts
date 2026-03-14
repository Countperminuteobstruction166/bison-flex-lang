import { BisonDocument } from '../parser/types';

const EPSILON = 'ε';

/**
 * Compute First sets for all non-terminals in a Bison grammar.
 * Uses iterative fixed-point algorithm.
 */
export function computeFirstSets(doc: BisonDocument): Map<string, Set<string>> {
  const first = new Map<string, Set<string>>();
  const ruleNames = new Set(doc.rules.keys());

  // Initialize empty sets for all rules
  for (const name of ruleNames) {
    first.set(name, new Set());
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const [name, rule] of doc.rules) {
      const currentFirst = first.get(name)!;
      const sizeBefore = currentFirst.size;

      for (const alt of rule.alternatives) {
        if (alt.symbols.length === 0) {
          // Empty production → ε ∈ First(name)
          currentFirst.add(EPSILON);
          continue;
        }

        let allDeriveEpsilon = true;
        for (const sym of alt.symbols) {
          if (ruleNames.has(sym)) {
            // Non-terminal: add First(sym) \ {ε}
            const symFirst = first.get(sym)!;
            for (const s of symFirst) {
              if (s !== EPSILON) currentFirst.add(s);
            }
            if (!symFirst.has(EPSILON)) {
              allDeriveEpsilon = false;
              break;
            }
          } else {
            // Terminal: add it directly
            currentFirst.add(sym);
            allDeriveEpsilon = false;
            break;
          }
        }

        if (allDeriveEpsilon) {
          currentFirst.add(EPSILON);
        }
      }

      if (currentFirst.size !== sizeBefore) {
        changed = true;
      }
    }
  }

  return first;
}

/**
 * Compute Follow sets for all non-terminals in a Bison grammar.
 * Requires precomputed First sets.
 */
export function computeFollowSets(
  doc: BisonDocument,
  firstSets: Map<string, Set<string>>
): Map<string, Set<string>> {
  const follow = new Map<string, Set<string>>();
  const ruleNames = new Set(doc.rules.keys());

  // Initialize empty sets
  for (const name of ruleNames) {
    follow.set(name, new Set());
  }

  // Start symbol gets $end
  const startSymbol = doc.startSymbol ?? [...doc.rules.keys()][0];
  if (startSymbol && follow.has(startSymbol)) {
    follow.get(startSymbol)!.add('$end');
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const [lhs, rule] of doc.rules) {
      for (const alt of rule.alternatives) {
        for (let i = 0; i < alt.symbols.length; i++) {
          const B = alt.symbols[i];
          if (!ruleNames.has(B)) continue; // only compute Follow for non-terminals

          const followB = follow.get(B)!;
          const sizeBefore = followB.size;

          // Look at β = symbols after B
          const beta = alt.symbols.slice(i + 1);

          if (beta.length === 0) {
            // A → αB : add Follow(A) to Follow(B)
            const followA = follow.get(lhs)!;
            for (const s of followA) followB.add(s);
          } else {
            // A → αBβ : add First(β) \ {ε} to Follow(B)
            const firstBeta = computeFirstOfSequence(beta, firstSets, ruleNames);
            for (const s of firstBeta) {
              if (s !== EPSILON) followB.add(s);
            }
            // If ε ∈ First(β), add Follow(A) to Follow(B)
            if (firstBeta.has(EPSILON)) {
              const followA = follow.get(lhs)!;
              for (const s of followA) followB.add(s);
            }
          }

          if (followB.size !== sizeBefore) {
            changed = true;
          }
        }
      }
    }
  }

  return follow;
}

/**
 * Compute First of a sequence of symbols (β = Y₁Y₂...Yₙ).
 */
function computeFirstOfSequence(
  symbols: string[],
  firstSets: Map<string, Set<string>>,
  ruleNames: Set<string>
): Set<string> {
  const result = new Set<string>();

  let allDeriveEpsilon = true;
  for (const sym of symbols) {
    if (ruleNames.has(sym)) {
      const symFirst = firstSets.get(sym)!;
      for (const s of symFirst) {
        if (s !== EPSILON) result.add(s);
      }
      if (!symFirst.has(EPSILON)) {
        allDeriveEpsilon = false;
        break;
      }
    } else {
      // Terminal
      result.add(sym);
      allDeriveEpsilon = false;
      break;
    }
  }

  if (allDeriveEpsilon) {
    result.add(EPSILON);
  }

  return result;
}
