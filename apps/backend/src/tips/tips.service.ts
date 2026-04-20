import { Injectable } from '@nestjs/common';
import { TIPS, Tip, CHANGELOG, ChangelogEntry } from './tips';

@Injectable()
export class TipsService {
  /**
   * In-memory store of dismissed tips per user.
   * In production this could be backed by a database table or Redis,
   * but for an intranet with moderate user count this is sufficient.
   * The frontend also maintains its own localStorage copy for instant UX.
   */
  private dismissedTips: Map<string, Set<string>> = new Map();

  /**
   * Returns the changelog entries, optionally filtered by version.
   */
  getChangelog(version?: string): ChangelogEntry[] {
    if (version) {
      return CHANGELOG.filter((entry) => entry.version === version);
    }
    return CHANGELOG;
  }

  /**
   * Returns tips filtered by context and role, sorted by priority (descending).
   * Tips whose targetRoles is empty match all roles.
   */
  getTips(context: string | undefined, role: string): Tip[] {
    let filtered = TIPS.filter((tip) => {
      // Role filter: empty targetRoles means all roles
      if (tip.targetRoles.length > 0 && !tip.targetRoles.includes(role)) {
        return false;
      }
      // Context filter
      if (context && tip.context !== context) {
        return false;
      }
      return true;
    });

    // Sort by priority descending
    filtered = filtered.sort((a, b) => b.priority - a.priority);

    return filtered;
  }

  /**
   * Marks a tip as dismissed for a given user.
   */
  dismissTip(userId: string, tipId: string): { dismissed: string[] } {
    if (!this.dismissedTips.has(userId)) {
      this.dismissedTips.set(userId, new Set());
    }
    this.dismissedTips.get(userId)!.add(tipId);
    return { dismissed: Array.from(this.dismissedTips.get(userId)!) };
  }

  /**
   * Returns the list of dismissed tip IDs for a user.
   */
  getDismissedTips(userId: string): { dismissed: string[] } {
    const set = this.dismissedTips.get(userId);
    return { dismissed: set ? Array.from(set) : [] };
  }
}
