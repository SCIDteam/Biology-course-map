// ── Bull's Eye Layout: 4-Stage Data Pipeline ────────────────────────────────
// Stage A: normalizeCourses   — raw course objects -> layout-ready nodes
// Stage B: groupCoursesByLevelAndTheme — nodes -> levelGroups[level][primaryTheme]
// Stage C: computeBullsEyeLayout — pure calculation -> [{id,x,y,level,primaryTheme,laneIndex,angle,radius}]
// Stage D (rendering) lives in bio_script.js and only consumes this module's output.
(function (global) {

    const PRIORITY_THEMES = [
        "Cells", "Molecules", "Genetics", "Physiology", "Ecology",
        "Evolution", "Microbiology", "Lab Methods", "Other", "Unassigned"
    ];

    const DEFAULT_CONFIG = {
        nodeW: 80,
        nodeH: 32,
        fontSize: 15,
        fontWeight: 650,
        rx: 18,
        ry: 18,
        laneGap: 8,
        bandPadding: 10,
        interBandGap: 12,
        clusterGapAngleDeg: 6,
        layoutMode: "themeClustered", // fallback: "levelOnly"
        baseInnerRadius: 50,
        minNodeArcGap: 14,
        maxLanesPerLevel: 4,
        collisionPadding: 4,
        collisionPasses: 12,
        collisionShiftDeg: 1.2,
        collisionMaxShiftDeg: 8,
        levelBandExtra: {
            1: 0,
            2: 22,
            3: 40,
            4: 50
        },
        priorityThemes: PRIORITY_THEMES
    };

    function firstUsableString(values) {
        if (!Array.isArray(values)) return null;
        const found = values.find(v => typeof v === "string" && v.trim().length > 0);
        return found ? found.trim() : null;
    }

    // ── Stage A: Normalize ──────────────────────────────────────────────────
    function normalizeCourse(course) {
        const id = (course && typeof course.course_code === "string" && course.course_code.trim())
            ? course.course_code.trim()
            : "Unassigned";
        const themes = Array.isArray(course && course.theme)
            ? course.theme.filter(t => typeof t === "string" && t.trim().length > 0)
            : [];
        const primaryTheme = firstUsableString(themes) || "Unassigned";
        const level = (course && typeof course.level === "number" && !Number.isNaN(course.level))
            ? course.level
            : "Unassigned";

        return { id, code: id, level, themes, primaryTheme, raw: course };
    }

    function normalizeCourses(rawCourses) {
        return (rawCourses || []).map(normalizeCourse);
    }

    // ── Stage B: Group by level, then primaryTheme ─────────────────────────
    function groupCoursesByLevelAndTheme(nodes) {
        const levelGroups = {};
        (nodes || []).forEach(node => {
            const level = node.level;
            const theme = node.primaryTheme;
            if (!levelGroups[level]) levelGroups[level] = {};
            if (!levelGroups[level][theme]) levelGroups[level][theme] = [];
            levelGroups[level][theme].push(node);
        });
        return levelGroups;
    }

    // Stable priority order, with unknown themes inserted alphabetically right before "Unassigned"
    function buildThemeOrder(themesPresent, priorityThemes) {
        const priority = priorityThemes.filter(t => t !== "Unassigned");
        const known = new Set(priority);
        const present = new Set(themesPresent);
        const unknown = [...present]
            .filter(t => t !== "Unassigned" && !known.has(t))
            .sort((a, b) => a.localeCompare(b));
        const ordered = [...priority, ...unknown, "Unassigned"];
        return ordered.filter(t => present.has(t));
    }

    function courseNumber(code) {
        const match = /(\d+)/.exec(code || "");
        return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
    }

    // Sort within a cluster: course number ascending, then course code alphabetically
    function compareCourses(a, b) {
        const numA = courseNumber(a.code);
        const numB = courseNumber(b.code);
        if (numA !== numB) return numA - numB;
        return (a.code || "").localeCompare(b.code || "");
    }

    function compareLevels(a, b) {
        if (a === "Unassigned") return 1;
        if (b === "Unassigned") return -1;
        return Number(a) - Number(b);
    }

    // Midpoint / thirds / quarters mapping: fraction = (laneIndex+1)/(laneCount+1)
    function laneRadius(laneIndex, laneCount, bandInner, bandOuter) {
        const fraction = (laneIndex + 1) / (laneCount + 1);
        return bandInner + fraction * (bandOuter - bandInner);
    }

    // Scale lane count per level to the minimum needed so nodes don't crowd,
    // keeping the band (and therefore the whole map) as tight as possible.
    function chooseLaneLayout(nodeCount, availableDeg, bandInner, config) {
        for (let laneCount = 1; laneCount <= config.maxLanesPerLevel; laneCount++) {
            const thickness = laneCount * config.nodeH + (laneCount - 1) * config.laneGap + 2 * config.bandPadding;
            const bandOuter = bandInner + thickness;
            const nodesPerLane = Math.ceil(nodeCount / laneCount);
            const smallestLaneRadius = laneRadius(0, laneCount, bandInner, bandOuter);
            const availableArc = 2 * Math.PI * smallestLaneRadius * (availableDeg / 360);
            const requiredArc = nodesPerLane * (config.nodeW + config.minNodeArcGap);
            if (requiredArc <= availableArc || laneCount === config.maxLanesPerLevel) {
                return { laneCount, bandOuter };
            }
        }
    }

    // ── Stage C: Compute layout (pure) ──────────────────────────────────────
    // courses: normalized nodes (output of Stage A). Groups internally (Stage B),
    // then positions every node. Returns an array of coordinates; per-level band
    // metadata is attached as a non-enumerable-contract-breaking `.bands` prop
    // so Stage D can draw boundary lines without recomputing any geometry.
    function nodeRect(node, cfg) {
        const pad = cfg.collisionPadding || 0;

        return {
            left: node.x - cfg.nodeW / 2 - pad,
            right: node.x + cfg.nodeW / 2 + pad,
            top: node.y - cfg.nodeH / 2 - pad,
            bottom: node.y + cfg.nodeH / 2 + pad
        };
    }

    function boxesOverlap(a, b) {
        return (
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top
        );
    }

    function applyAngleShift(node, shiftDeg) {
        const shiftRad = shiftDeg * Math.PI / 180;

        node.angle += shiftRad;
        node.x = node.radius * Math.cos(node.angle);
        node.y = node.radius * Math.sin(node.angle);
    }

    function resolveSmallOverlaps(nodes, cfg) {
        const originalAngles = new Map();

        nodes.forEach(node => {
            originalAngles.set(node.id, node.angle);
        });

        for (let pass = 0; pass < cfg.collisionPasses; pass++) {
            let moved = false;

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i];
                    const b = nodes[j];

                    const rectA = nodeRect(a, cfg);
                    const rectB = nodeRect(b, cfg);

                    if (!boxesOverlap(rectA, rectB)) continue;

                    const aOriginal = originalAngles.get(a.id);
                    const bOriginal = originalAngles.get(b.id);

                    const aCurrentShift = (a.angle - aOriginal) * 180 / Math.PI;
                    const bCurrentShift = (b.angle - bOriginal) * 180 / Math.PI;

                    const direction = a.angle <= b.angle ? 1 : -1;

                    if (Math.abs(aCurrentShift) < cfg.collisionMaxShiftDeg) {
                        applyAngleShift(a, -direction * cfg.collisionShiftDeg);
                        moved = true;
                    }

                    if (Math.abs(bCurrentShift) < cfg.collisionMaxShiftDeg) {
                        applyAngleShift(b, direction * cfg.collisionShiftDeg);
                        moved = true;
                    }
                }
            }

            if (!moved) break;
        }

        return nodes;
    }


    function computeBullsEyeLayout(courses, config) {
        const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
        const levelGroups = groupCoursesByLevelAndTheme(courses);
        const levels = Object.keys(levelGroups).sort(compareLevels);

        const results = [];
        const bands = [];
        let runningRadius = cfg.baseInnerRadius;

        levels.forEach(level => {
            const themeMap = levelGroups[level];

            let clusters;
            if (cfg.layoutMode === "levelOnly") {
                const allNodes = Object.values(themeMap).reduce((acc, arr) => acc.concat(arr), []).sort(compareCourses);
                clusters = [{ theme: null, nodes: allNodes }];
            } else {
                const themesPresent = Object.keys(themeMap);
                const order = buildThemeOrder(themesPresent, cfg.priorityThemes);
                clusters = order.map(theme => ({
                    theme,
                    nodes: themeMap[theme].slice().sort(compareCourses)
                }));
            }

            const totalNodes = clusters.reduce((sum, c) => sum + c.nodes.length, 0);
            if (totalNodes === 0) return;

            const numClusters = clusters.length;
            const gapTotalDeg = cfg.layoutMode === "levelOnly" ? 0 : numClusters * cfg.clusterGapAngleDeg;
            const availableDeg = 360 - gapTotalDeg;
            const angularStepDeg = availableDeg / totalNodes;

            const bandInner = runningRadius;
            const laneLayout = chooseLaneLayout(totalNodes, availableDeg, bandInner, cfg);

            const laneCount = laneLayout.laneCount;
            const extraBandWidth = cfg.levelBandExtra[String(level)] || 0;
            const bandOuter = laneLayout.bandOuter + extraBandWidth;

            let cursorDeg = -90; // start at top, sweep clockwise
            let globalIndex = 0; // runs across cluster boundaries so lanes stay evenly balanced
            clusters.forEach(cluster => {
                cluster.nodes.forEach((node, i) => {
                    const angleDeg = cursorDeg + (i + 0.5) * angularStepDeg;
                    const angleRad = angleDeg * Math.PI / 180;
                    const laneIndex = globalIndex % laneCount;
                    const r = laneRadius(laneIndex, laneCount, bandInner, bandOuter);
                    results.push({
                        id: node.id,
                        x: r * Math.cos(angleRad),
                        y: r * Math.sin(angleRad),
                        level,
                        primaryTheme: node.primaryTheme,
                        laneIndex,
                        angle: angleRad,
                        radius: r
                    });
                    globalIndex++;
                });
                cursorDeg += cluster.nodes.length * angularStepDeg + cfg.clusterGapAngleDeg;
            });

            bands.push({ level, innerRadius: bandInner, outerRadius: bandOuter, laneCount });
            runningRadius = bandOuter + cfg.interBandGap;
        });
        resolveSmallOverlaps(results, cfg);

        results.bands = bands;
        return results;
    }

    global.BullsEyeLayout = {
        DEFAULT_CONFIG,
        PRIORITY_THEMES,
        normalizeCourse,
        normalizeCourses,
        groupCoursesByLevelAndTheme,
        buildThemeOrder,
        compareCourses,
        laneRadius,
        computeBullsEyeLayout
    };

})(window);
