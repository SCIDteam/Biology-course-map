function adjustSVGSize() {
    const svg = document.getElementById("mySVG");
    const mainDiv = document.getElementById("main");

    const mainWidth = mainDiv.clientWidth;
    const mainHeight = mainDiv.clientHeight;

    svg.setAttribute("width", mainWidth);
    svg.setAttribute("height", mainHeight);
}

let _recenterMapFn = null;

window.onload = adjustSVGSize;
window.onresize = function() {
    adjustSVGSize();
    if (_recenterMapFn) _recenterMapFn();
};

document.getElementById('sidebar-toggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('collapsed');
    // Wait for the CSS width transition (~300ms) then re-fit the map
    setTimeout(function() {
        adjustSVGSize();
        if (_recenterMapFn) _recenterMapFn();
    }, 320);
});

d3.json('frontend/data/bio_courses_tag.json').then(coursesData => {

    // Category uses the `category` array field (e.g. ["Introductory", "Fundamentals"])
    const categories = [...new Set(coursesData.flatMap(course => course.category))].sort();
    // Theme uses the `theme` array field (renamed from `themes` in the general dataset)
    const themes = [...new Set(coursesData.flatMap(course => course.theme))].sort();
    // Level uses the numeric `level` field (1–4) rather than deriving from the course code
    const levels = [...new Set(coursesData.map(course => course.level))]
                    .sort((a, b) => a - b)
                    .map(l => `${l * 100} level`);

    const categoryDropdownButton  = document.getElementById("dropdownButton");
    const categoryDropdownContent = document.getElementById("dropdownContent");

    const themesDropdownButton  = document.getElementById("dropdownButton-2");
    const themesDropdownContent = document.getElementById("dropdownContent-2");

    const levelsDropdownButton  = document.getElementById("dropdownButton-3");
    const levelsDropdownContent = document.getElementById("dropdownContent-3");

    let selectedCategories = [];
    let selectedThemes = [];
    let selectedLevel = [];
    let selectedComponents = [];
    let coreqEdgeIds = new Set();
    let frozenCourseId = null;
    let _unfreezeSelection = null;
    let _selectCourse = null;
    let _zoom = null;
    let _lastMaxR = 200;

    // Layout pipeline config — layoutMode: "themeClustered" (default) or "levelOnly".
    // Exposed as window.setBullsEyeLayoutMode(mode) so the two configurations can be
    // compared during testing without touching the sidebar UI.
    const bullsEyeConfig = Object.assign({}, BullsEyeLayout.DEFAULT_CONFIG);
    window.setBullsEyeLayoutMode = function(mode) {
        bullsEyeConfig.layoutMode = mode === "levelOnly" ? "levelOnly" : "themeClustered";
        updateGraph(selectedCategories, selectedThemes, selectedLevel);
    };

    function recenterMap() {
        if (!_zoom) return;
        adjustSVGSize();
        const svgEl = document.getElementById("mySVG");
        const svgW  = svgEl.clientWidth;
        const svgH  = svgEl.clientHeight;
        const fitScale = Math.min(svgW, svgH) / (2 * _lastMaxR + 70) * 0.9;
        d3.select("#mySVG").call(_zoom.transform, d3.zoomIdentity
            .translate(svgW / 2, svgH / 2)
            .scale(fitScale)
        );
        const slider  = document.getElementById("zoomSlider");
        const display = document.getElementById("zoomValue");
        if (slider)  slider.value = fitScale;
        if (display) display.textContent = Math.round(fitScale * 100) + '%';
    }
    _recenterMapFn = recenterMap;

    const componentsDropdownButton  = document.getElementById("dropdownButton-4");
    const componentsDropdownContent = document.getElementById("dropdownContent-4");

    const svg = d3.select("#mySVG");

    // ── Category filter ───────────────────────────────────────────────────────
    categories.forEach(category => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = category;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedCategories.push(this.value);
            } else {
                selectedCategories = selectedCategories.filter(c => c !== this.value);
            }
            categoryDropdownButton.textContent = selectedCategories.length > 0
                ? `Category: ${selectedCategories.length} selected`
                : "Select Category";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(category));
        categoryDropdownContent.appendChild(label);
    });

    // ── Theme filter ─────────────────────────────────────────────────────────
    themes.forEach(theme => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = theme;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedThemes.push(this.value);
            } else {
                selectedThemes = selectedThemes.filter(t => t !== this.value);
            }
            themesDropdownButton.textContent = selectedThemes.length > 0
                ? `Theme: ${selectedThemes.length} selected`
                : "Select Theme";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(theme));
        themesDropdownContent.appendChild(label);
    });

    // ── Level filter ─────────────────────────────────────────────────────────
    levels.forEach(level => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = level;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedLevel.push(this.value);
            } else {
                selectedLevel = selectedLevel.filter(l => l !== this.value);
            }
            levelsDropdownButton.textContent = selectedLevel.length > 0
                ? `Level: ${selectedLevel.length} selected`
                : "Select Course Level";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(level));
        levelsDropdownContent.appendChild(label);
    });

    // Pre-select all levels on initial load
    levelsDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        selectedLevel.push(cb.value);
    });
    levelsDropdownButton.textContent = `Level: ${selectedLevel.length} selected`;

    // ── Dropdown toggle / outside-click close ─────────────────────────────────
    categoryDropdownButton.addEventListener('click', function() {
        categoryDropdownContent.classList.toggle("show");
    });
    themesDropdownButton.addEventListener('click', function() {
        themesDropdownContent.classList.toggle("show");
    });
    levelsDropdownButton.addEventListener('click', function() {
        levelsDropdownContent.classList.toggle("show");
    });

    document.addEventListener('click', function(event) {
        if (!categoryDropdownButton.contains(event.target) && !categoryDropdownContent.contains(event.target))
            categoryDropdownContent.classList.remove("show");
    });
    document.addEventListener('click', function(event) {
        if (!themesDropdownButton.contains(event.target) && !themesDropdownContent.contains(event.target))
            themesDropdownContent.classList.remove("show");
    });
    document.addEventListener('click', function(event) {
        if (!levelsDropdownButton.contains(event.target) && !levelsDropdownContent.contains(event.target))
            levelsDropdownContent.classList.remove("show");
    });

    // ── Component filter ──────────────────────────────────────────────────────
    ['Lecture', 'Labs', 'Tutorials'].forEach(component => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = component;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedComponents.push(this.value);
            } else {
                selectedComponents = selectedComponents.filter(c => c !== this.value);
            }
            componentsDropdownButton.textContent = selectedComponents.length > 0
                ? `Component: ${selectedComponents.length} selected`
                : "Select Component";
            updateGraph(selectedCategories, selectedThemes, selectedLevel);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(component));
        componentsDropdownContent.appendChild(label);
    });

    componentsDropdownButton.addEventListener('click', function() {
        componentsDropdownContent.classList.toggle("show");
    });

    document.addEventListener('click', function(event) {
        if (!componentsDropdownButton.contains(event.target) && !componentsDropdownContent.contains(event.target))
            componentsDropdownContent.classList.remove("show");
    });

    // ── Graph setup ───────────────────────────────────────────────────────────
    var g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: 'TB',
        nodesep: 30,
        edgesep: 0,
        ranksep: 200
    });

    // Render full course map on initial load (all levels pre-selected)
    updateGraph(selectedCategories, selectedThemes, selectedLevel);

    // ── Layout dispatcher ─────────────────────────────────────────────────────
    function renderGraph(filteredCourseIds) {
        renderBullsEyeLayout(filteredCourseIds);
    }

    // ── Bull's Eye layout (radial, no edge arrows) ────────────────────────────
    // Stage A+B+C (normalize → group → compute positions) run entirely inside
    // BullsEyeLayout.computeBullsEyeLayout. This function is Stage D: it only
    // draws boundary lines, optional track fills, labels, and wires interactions.
    function renderBullsEyeLayout(filteredCourseIds) {
        d3.select("#initialMessage").style("display", "none");

        const cfg = bullsEyeConfig;

        // Only lay out courses that are actually present as nodes in the graph
        const nodeIds = new Set(g.nodes());
        const coursesForLayout = coursesData.filter(c => nodeIds.has(c.course_code));

        const normalizedNodes = BullsEyeLayout.normalizeCourses(coursesForLayout);
        const layout = BullsEyeLayout.computeBullsEyeLayout(normalizedNodes, cfg);
        const bands  = layout.bands;

        const nodeData = layout; // { id, x, y, level, primaryTheme, laneIndex, angle, radius }

        const inner = svg.append("g");

        // ── Boundary lines + optional light track fills ────────────────────────
        // Painted outermost-first so each band's fill only covers its own annulus.
        bands.slice().reverse().forEach((band, idx) => {
            inner.append("circle")
                .attr("cx", 0).attr("cy", 0)
                .attr("r", band.outerRadius)
                .attr("fill", idx % 2 === 0 ? "#eef0f2" : "#ffffff")
                .attr("stroke", "#423e3e")
                .attr("stroke-width", 3)
                .attr("stroke-dasharray", "5,4");
        });
        // Explicit boundary for the innermost band's inner edge (the true center hole)
        if (bands.length > 0) {
            inner.append("circle")
                .attr("cx", 0).attr("cy", 0)
                .attr("r", bands[0].innerRadius)
                .attr("fill", "none")
                .attr("stroke", "#423e3e")
                .attr("stroke-width", 3)
                .attr("stroke-dasharray", "5,4");
        }

        // Level labels
        bands.forEach(band => {
            const labelText = band.level === "Unassigned" ? "Unassigned" : `${band.level * 100} Level`;
            inner.append("text")
                .attr("x", 0).attr("y", -band.outerRadius + 30)
                .attr("text-anchor", "middle")
                .style("font-size", "22px")
                .style("font-weight", "bold")
                .style("fill", "#0e4bbd")
                .style("pointer-events", "none")
                .text(labelText);
        });

        // Center dot
        inner.append("circle")
            .attr("cx", 0).attr("cy", 0)
            .attr("r", 5)
            .attr("fill", "#d0d0d0");

        // Draw nodes as rounded rects — pure rendering, positions come from the layout array
        const nodeGroups = inner.selectAll("g.bulls-node")
            .data(nodeData)
            .enter()
            .append("g")
            .attr("class", "bulls-node")
            .attr("id", d => d.id)
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .style("cursor", "pointer")
            .style("opacity", d => filteredCourseIds.includes(d.id) ? 1.0 : 0.45);

        nodeGroups.append("rect")
            .attr("x", -cfg.nodeW / 2).attr("y", -cfg.nodeH / 2)
            .attr("width", cfg.nodeW).attr("height", cfg.nodeH)
            .attr("rx", cfg.rx).attr("ry", cfg.ry)
            .attr("fill", d => filteredCourseIds.includes(d.id) ? "#EEDFCC" : "#fff")
            .attr("stroke", "#272727").attr("stroke-width", 1);

        nodeGroups.append("text")
            .attr("text-anchor", "middle").attr("dy", "0.35em")
            .style("font-size", cfg.fontSize + "px")
            .style("font-weight", cfg.fontWeight)
            .style("pointer-events", "none")
            .text(d => d.id);

        // Zoom
        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", function(event) {
                inner.attr("transform", event.transform);
                const slider = document.getElementById("zoomSlider");
                const display = document.getElementById("zoomValue");
                if (slider) slider.value = event.transform.k;
                if (display) display.textContent = Math.round(event.transform.k * 100) + '%';
            });
        svg.call(zoom);
        _zoom = zoom;

        adjustSVGSize();
        const svgBounds = svg.node().getBoundingClientRect();
        const svgW = svgBounds.width;
        const svgH = svgBounds.height;
        const maxR = bands.length > 0 ? bands[bands.length - 1].outerRadius : 200;
        _lastMaxR  = maxR;
        const fitScale = Math.min(svgW, svgH) / (2 * maxR + 10) * 0.9;

        svg.call(zoom.transform, d3.zoomIdentity
            .translate(svgW / 2, svgH / 2)
            .scale(fitScale)
        );

        const downstreamMap = buildDownstreamMap(coursesData);

        var tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        function applyBullsEyeHighlight(courseCode) {
            nodeGroups.style("opacity", 0.45);

            inner.select(`g.bulls-node[id="${courseCode}"]`).style("opacity", 1);
            inner.select(`g.bulls-node[id="${courseCode}"]`).select("rect")
                .attr("fill", filteredCourseIds.includes(courseCode) ? "#EEDFCC" : "cyan");
            inner.select(`g.bulls-node[id="${courseCode}"]`).select("text")
                .style("font-weight", "bold");

            collectUpstreamEdges(courseCode, coursesData).forEach(({ from, type }) => {
                const color = type === 'corequisite' ? 'coral' : 'cyan';
                inner.select(`g.bulls-node[id="${from}"]`).style("opacity", 1);
                inner.select(`g.bulls-node[id="${from}"]`).select("rect").attr("fill", color);
                inner.select(`g.bulls-node[id="${from}"]`).select("text").style("font-weight", "bold");
            });

            collectDownstreamEdges(courseCode, downstreamMap).forEach(({ to }) => {
                inner.select(`g.bulls-node[id="${to}"]`).style("opacity", 1);
                inner.select(`g.bulls-node[id="${to}"]`).select("rect").attr("fill", "#90EE90");
                inner.select(`g.bulls-node[id="${to}"]`).select("text").style("font-weight", "bold");
            });
        }

        function resetBullsEyeHighlight() {
            nodeGroups.style("opacity", d => filteredCourseIds.includes(d.id) ? 1.0 : 0.45);
            nodeGroups.select("rect")
                .attr("fill", d => filteredCourseIds.includes(d.id) ? "#EEDFCC" : "#fff");
            nodeGroups.select("text").style("font-weight", null);
        }

        nodeGroups.on("click", function(_event, d) {
            const course = coursesData.find(c => c.course_code === d.id);
            if (!course) return;
            tooltip.transition().duration(10).style("opacity", 0);
            if (frozenCourseId === d.id) {
                frozenCourseId = null;
                resetBullsEyeHighlight();
                clearCourseInfoSidebar();
            } else {
                frozenCourseId = d.id;
                applyBullsEyeHighlight(d.id);
                showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
            }
        });

        nodeGroups.on("mouseover", function(_event, d) {
            if (frozenCourseId !== null) return;
            const course = coursesData.find(c => c.course_code === d.id);
            if (!course) return;
            tooltip.transition().duration(10).style("opacity", 1);
            tooltip.html(`
                <div class="title">${course.course_code}: ${course['course title']}</div>
            `);
            applyBullsEyeHighlight(d.id);
        })
        .on("mousemove", function(event) {
            if (frozenCourseId !== null) return;
            const tooltipWidth  = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;
            const x = event.clientX + 10;
            const y = event.clientY + 10;
            const xPos = x + tooltipWidth  > window.innerWidth  ? x - tooltipWidth  - 20 : x;
            const yPos = y + tooltipHeight > window.innerHeight ? y - tooltipHeight - 20 : y;
            tooltip.style("left", xPos + "px").style("top", yPos + "px");
        })
        .on("mouseout", function() {
            if (frozenCourseId !== null) return;
            tooltip.transition().duration(10).style("opacity", 0);
            resetBullsEyeHighlight();
        });

        _unfreezeSelection = function() {
            if (frozenCourseId !== null) {
                frozenCourseId = null;
                resetBullsEyeHighlight();
                clearCourseInfoSidebar();
            }
        };

        _selectCourse = function(courseCode) {
            const course = coursesData.find(c => c.course_code === courseCode);
            if (!course) return;
            frozenCourseId = courseCode;
            applyBullsEyeHighlight(courseCode);
            showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
        };
    }

    function updateGraph(selectedCategories, selectedThemes, selectedLevel) {
        selectedCategories = ensureArray(selectedCategories);
        selectedThemes     = ensureArray(selectedThemes);
        selectedLevel      = ensureArray(selectedLevel);

        clearGraph();

        if (areFiltersEmpty(selectedCategories, selectedThemes, selectedLevel)) {
            showInitialMessage();
            return;
        }

        // Always build from the full dataset so every node has a stable ring position.
        // filteredCourseIds controls opacity/coloring — active courses stay bright,
        // courses that don't match the current filters fade to 0.45.
        buildGraph(coursesData);
        const activeCourses = filterCourses(selectedCategories, selectedThemes, selectedLevel);
        renderGraph(activeCourses.map(c => c.course_code));
    }

    function ensureArray(input) {
        return Array.isArray(input) ? input : [];
    }

    function clearGraph() {
        g.nodes().forEach(node => g.removeNode(node));
        g.edges().forEach(edge => g.removeEdge(edge.v, edge.w));
        coreqEdgeIds.clear();
        d3.select("#mySVG g").remove();
        frozenCourseId = null;
        _selectCourse  = null;
        _zoom          = null;
        clearCourseInfoSidebar();
    }

    function areFiltersEmpty(categories, themes, level) {
        return categories.length === 0 && themes.length === 0 && level.length === 0;
    }

    function filterCourses(categories, themes, level) {
        return coursesData.filter(course => {
            const courseComponents = Array.isArray(course.components)
                ? course.components
                : (course.components ? [course.components] : []);
            return (categories.length === 0 || categories.some(cat => course.category.includes(cat))) &&
                (themes.length    === 0 || themes.some(theme => course.theme.includes(theme))) &&
                (level.length     === 0 || level.includes(`${course.level * 100} level`)) &&
                (selectedComponents.length === 0 || selectedComponents.some(comp => courseComponents.includes(comp)));
        });
    }

    function buildGraph(courses) {
        const addedNodes = new Set();

        courses.forEach(course => {
            addNodeIfNotExists(course.course_code, addedNodes);

            course.prerequisites.forEach(prereq => {
                addNodeIfNotExists(prereq, addedNodes);
                addEdge(prereq, course.course_code, 'prerequisite');
            });

            course.corequisites.forEach(coreq => {
                addNodeIfNotExists(coreq, addedNodes);
                addEdge(coreq, course.course_code, 'corequisite');
            });
        });
    }

    function addNodeIfNotExists(nodeId, addedNodes) {
        if (!addedNodes.has(nodeId)) {
            g.setNode(nodeId, { label: nodeId, id: nodeId });
            addedNodes.add(nodeId);
        }
    }

    function addEdge(source, target, type) {
        if (type === 'corequisite') coreqEdgeIds.add(`${source}-${target}`);

        const edgeStyle = type === 'corequisite'
            ? { style: "stroke: coral; stroke-dasharray: 5, 5;", arrowheadStyle: "fill: coral" }
            : { arrowheadStyle: "fill: #000" };

        g.setEdge(source, target, {
            label: "",
            id: `${source}-${target}`,
            curve: d3.curveBasis,
            ...edgeStyle
        });
    }

    function buildDownstreamMap(courses) {
        const map = {};
        courses.forEach(course => {
            course.prerequisites.forEach(prereq => {
                if (!map[prereq]) map[prereq] = [];
                map[prereq].push({ code: course.course_code, type: 'prerequisite' });
            });
            course.corequisites.forEach(coreq => {
                if (!map[coreq]) map[coreq] = [];
                map[coreq].push({ code: course.course_code, type: 'corequisite' });
            });
        });
        return map;
    }

    function collectUpstreamEdges(courseCode, courses, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const course = courses.find(c => c.course_code === courseCode);
        if (!course) return [];
        const edges = [];
        course.prerequisites.forEach(prereq => {
            edges.push({ from: prereq, to: courseCode, type: 'prerequisite' });
            collectUpstreamEdges(prereq, courses, visited).forEach(e => edges.push(e));
        });
        course.corequisites.forEach(coreq => {
            edges.push({ from: coreq, to: courseCode, type: 'corequisite' });
            collectUpstreamEdges(coreq, courses, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    function collectDownstreamEdges(courseCode, downstreamMap, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const edges = [];
        (downstreamMap[courseCode] || []).forEach(({ code, type }) => {
            edges.push({ from: courseCode, to: code, type });
            collectDownstreamEdges(code, downstreamMap, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    // ── Sidebar course info panel ─────────────────────────────────────────────
    function showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds) {
        const panel = document.getElementById("course-info-placeholder");

        const id          = course.course_code || "Not available";
        const name        = course['course title'] || "Not available";
        const description = course.description || "Not available";
        const credits     = course.credits != null ? course.credits : "Not available";
        const category    = Array.isArray(course.category) ? course.category.join(', ') : (course.category || "Not available");
        const term        = Array.isArray(course.term)     ? course.term.join(', ')     : (course.term     || "Not available");
        const level       = course.level != null ? `${course.level * 100} level` : "Not available";
        const components  = Array.isArray(course.components) ? course.components.join(', ') : (course.components || "Not available");
        const calendarUrl = course.calendar_url || "";

        const prereqList = course.prerequisites || [];
        const coreqList  = course.corequisites  || [];
        const depList    = (downstreamMap[id]   || []).map(d => d.code);

        const isFiltered = filteredCourseIds && filteredCourseIds.includes(id);
        const headerBg   = isFiltered ? '#f9f2ea' : '#e3f8f9';

        function buildCards(codeList, cardClass) {
            if (!codeList.length) return '<p class="ci-empty">None listed.</p>';
            return codeList.map(code => {
                const rel     = coursesData.find(c => c.course_code === code);
                const relName = rel ? (rel['course title'] || '') : '';
                return `<button class="ci-course-card ${cardClass}" data-course-code="${code}">
                    <div class="ci-card-code">${code}</div>
                    ${relName ? `<div class="ci-card-name">${relName}</div>` : ''}
                </button>`;
            }).join('');
        }

        const calendarLink = calendarUrl
            ? `<span class="ci-key">Calendar</span><span class="ci-val"><a href="${calendarUrl}" target="_blank" rel="noopener">View ↗</a></span>`
            : '';

        panel.classList.add("filled");
        panel.innerHTML = `
            <div class="ci-header" style="background:${headerBg}">
                <div class="ci-header-content">
                    <div class="ci-code">${id}</div>
                    <div class="ci-name">${name}</div>
                </div>
                <button class="ci-close" id="course-info-close" title="Clear selection">✕</button>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Course Details</div>
                <div class="ci-kv-grid">
                    <span class="ci-key">Level</span><span class="ci-val">${level}</span>
                    <span class="ci-key">Credits</span><span class="ci-val">${credits}</span>
                    <span class="ci-key">Term</span><span class="ci-val">${term}</span>
                    <span class="ci-key">Category</span><span class="ci-val">${category}</span>
                    <span class="ci-key">Components</span><span class="ci-val">${components}</span>
                    ${calendarLink}
                </div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Description</div>
                <div class="ci-description">${description}</div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Prerequisites (${prereqList.length})</div>
                ${buildCards(prereqList, 'ci-card-prereq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Corequisites (${coreqList.length})</div>
                ${buildCards(coreqList, 'ci-card-coreq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Dependent Courses (${depList.length})</div>
                ${buildCards(depList, 'ci-card-dep')}
            </div>
        `;

        document.getElementById("course-info-close").addEventListener("click", function() {
            if (_unfreezeSelection) _unfreezeSelection();
        });

        panel.querySelectorAll('.ci-course-card[data-course-code]').forEach(btn => {
            btn.addEventListener('click', function() {
                if (_selectCourse) _selectCourse(this.dataset.courseCode);
            });
        });
    }

    function clearCourseInfoSidebar() {
        const panel = document.getElementById("course-info-placeholder");
        panel.classList.remove("filled");
        panel.textContent = "Click a course to view details.";
    }

    // ── Keyword search ────────────────────────────────────────────────────────
    function filterCoursesByKeywords(keywords) {
        if (!keywords) return [];
        const keywordArray = keywords.split(',').map(k => k.trim().toLowerCase());
        return coursesData.filter(course =>
            keywordArray.some(keyword => course.description.toLowerCase().includes(keyword))
        );
    }

    document.getElementById("searchButton").addEventListener('click', function() {
        const keywords = document.getElementById("keywordInput").value.trim();
        if (!keywords) return;

        const filteredCourses = filterCoursesByKeywords(keywords);

        clearGraph();
        buildGraph(coursesData);
        renderGraph(filteredCourses.map(c => c.course_code));
    });

    function showInitialMessage() {
        const svg = d3.select("#mySVG");
        const initialMessage = svg.select("#initialMessage");
        if (initialMessage.empty()) {
            svg.append("text")
                .attr("id", "initialMessage")
                .attr("x", "50%")
                .attr("y", "50%")
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .style("font-size", "60px")
                .style("fill", "#8B8378")
                .style("pointer-events", "none")
                .style("font-family", "Arial, sans-serif")
                .style("font-weight", "bold")
                .style("filter", "url(#text-shadow)")
                .text("Filter Courses from the sidebar");
        } else {
            initialMessage.style("display", "block");
        }
    }

    // ── Reset button ──────────────────────────────────────────────────────────
    document.getElementById("resetButton").addEventListener('click', function() {
        selectedCategories = [];
        selectedThemes     = [];
        selectedLevel      = [];
        selectedComponents = [];

        categoryDropdownButton.textContent  = "Select Category";
        themesDropdownButton.textContent    = "Select Theme";
        componentsDropdownButton.textContent = "Select Component";

        categoryDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        themesDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        componentsDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

        // Re-select all levels (reset to default all-levels state)
        levelsDropdownContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            selectedLevel.push(cb.value);
        });
        levelsDropdownButton.textContent = `Level: ${selectedLevel.length} selected`;

        document.getElementById("keywordInput").value = "";
        document.getElementById("dialog").style.display = "none";

        updateGraph(selectedCategories, selectedThemes, selectedLevel);
    });

    document.getElementById("close-dialog").onclick = function() {
        document.getElementById("dialog").style.display = "none";
    };

    // ── Zoom slider ───────────────────────────────────────────────────────────
    document.getElementById("zoomSlider").addEventListener("input", function() {
        if (!_zoom) return;
        const k = +this.value;
        const current = d3.zoomTransform(svg.node());
        svg.call(_zoom.transform, d3.zoomIdentity.translate(current.x, current.y).scale(k));
    });

}).catch(error => console.error('Error loading the JSON:', error));
