import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Component } from 'react'
import '../src/assets/style.css';

let STATE_ConfirmDeleteSet = () => null;
let STATE_ConfirmDelete = undefined;

let CategoryPalette = [
  '#A9937E',
  '#9CACA4',
  '#D3A47A',
  '#77B99D',
  '#915438',
  '#635749',
]

const ASSERT = (a, b = undefined) => {
  if (!a) {
    console.log(a, ' ', b ? b : "evaluated to false");
    debugger;
  }
}

const cancelConfirm = (event) => STATE_ConfirmDeleteSet(false);

const DestroySelectionButton = ({ onClick }) => {
  [STATE_ConfirmDelete, STATE_ConfirmDeleteSet] = React.useState(false);

  // Add event listener when component mounts

  const handleClick = (event) => {
    if (STATE_ConfirmDelete)
      onClick();
    else {
      STATE_ConfirmDeleteSet(true);
    }
  }

  return (
    <div className="property-row">
      <a id="delete" href="#" className="property-list-entry-value button button-primary button-delete" onClick={handleClick} onMouseOut={cancelConfirm}>
        {STATE_ConfirmDelete ? 'Confirm ?' : 'Delete'}
      </a>
    </div>
  );
}
export default DestroySelectionButton;

class CategoryMetaData {
  constructor(name, frameId) {
    this.name = name;
    this.frameId = frameId;
    events = [];
  }
}

class TimelineMetaData {
  constructor(name, frameId, start, end) {
    this.name = name;
    this.frameId = frameId;
    this.start = start;
    this.end = end;
    this.categories = [
    ];
  };
}

function stringify(obj, lvl = 2) {
  let cache = [];
  let str = JSON.stringify(obj, function (key, value) {
    if (typeof value === "object" && value !== null) {
      if (cache.indexOf(value) !== -1) {
        // Circular reference found, discard key
        return;
      }
      // Store value in our collection
      cache.push(value);
    }
    return value;
  }, stringify);
  cache = null; // reset the cache
  return str;
}

const DurationToUnitRatio = 60;
const DateEventHeight = 250;
const DateEventWidth = 400;
const DateEventMinWidth = 200;
const DateEventSpacing = 0;

const Padding = {
  bottom: 10, left: 10, right: 10, top: 10,
};

const CategorySpacing = 200;

const TimelinePadding = {
  bottom: 100, left: 100, right: 100, top: 100,
}
const CategoryPadding = {
  bottom: 50, left: 50, right: 50, top: 50,
}

const CategoryLabelWidth = 1000;

let categoryDefaultContentHeight = 320;
let eventDefaultHeight = 200;
let SelectedItem = null;
let NewDateEventYear = 2024;

class CategoryCache {
  constructor() {
    this.maxLevel = 0;

  }
}

let Cache = {
  categories: [

  ],


}


class AppCore extends Component {

  componentDidMount() {
    miro.board.ui.on('selection:update', this.props.callBack);
    window.addEventListener('beforeunload', this.componentCleanUp);
  }

  componentCleanUp() {
    miro.board.ui.off('selection:update', this.props.callBack);
  }

  componentWillUnmount() {
    this.componentCleanUp();
    window.removeEventListener('beforeunload', this.componentCleanUp); // remove the event handler for normal unmounting
  }

  render() {
    return <></>;
  }
}

const App = () => {

  let READ_Timelines = [];

  let TimeLine_NextIdName = 1;
  let Category_NextIdName = 1;
  let Event_NextIdName = 1;

  const destroyItem = async (Item) => {
    let timelineFrame = null;
    if (Item.type === 'frame') {
    }
    else if (Item.type === 'group') {
      timelineFrame = Item.parent;
      let dateEventShape = findDateEventShape(Item.items[0].id) || findDateEventShape(Item.items[1].id);
      if (dateEventShape) {
        timelineFrame = dateEventShape.parent;
      }
    }
    else
      timelineFrame = Item.parent;

    _destroyItem(Item);

    if (timelineFrame)
      await updateTimelineFrameGeometry(timelineFrame);
  }

  const _destroyItem = async (Item) => {
    if (Item.type === 'frame') {
      await destroyFrameOrGroupItem(Item);
      await miro.board.remove(Item.baseItem);
    }
    else if (Item.type === 'group') {
      let dateEventShape = findDateEventShape(Item.items[0].id) || findDateEventShape(Item.items[1].id);
      let timelineFrame = Item.parent;
      if (dateEventShape) {
        timelineFrame = dateEventShape.parent;
        dateEventShape.categoryGroup.dateEventShapes = dateEventShape.categoryGroup.dateEventShapes.filter(item => item !== dateEventShape);
        timelineFrame.dateEventShapes = timelineFrame.dateEventShapes.filter(item => item !== dateEventShape);
        Cache.dateEventShapes = Cache.dateEventShapes.filter(item => item !== dateEventShape);
      }
      await destroyFrameOrGroupItem(Item);
    }
    else if (Item.type === 'text') {
      if ('year' in Item.metadata) {
        let timelineFrame = Item.parent;
        timelineFrame.yearTexts = timelineFrame.yearTexts.filter(item => item !== Item);
        const dateEventShapes = getDateEventShapesForYear(Item.parent, Item.metadata.year);
        if (dateEventShapes.length)
          for (let dateEventShape of dateEventShapes) {
            await _destroyItem(dateEventShape);
          }
        await miro.board.remove(Item.baseItem);
      }
    }
    else if (Item.type === 'shape') {
      if ('dateEvent' in Item.metadata) {
        return await _destroyItem(Item.group);
      }
    }
  }

  const destroyFrameOrGroupItem = async (frameOrGroup) => {
    if (frameOrGroup.type === 'frame') {
      for (let child of await frameOrGroup.baseItem.getChildren())
        if (child.type === 'group') {
          await miro.board.remove(child);
        }

      for (let child of await frameOrGroup.baseItem.getChildren())
        if (child.type !== 'group') {
          await miro.board.remove(child);
        }
    }
    else {
      for (let child of await frameOrGroup.baseItem.getItems())
        if (child.type === 'group') {
          await miro.board.remove(child);
        }

      for (let child of await frameOrGroup.baseItem.getItems())
        if (child.type !== 'group') {
          await miro.board.remove(child);
        }
    }
  };

  const destroySelection = async () => {

    await destroyItem(SelectedItem);
    SelectedItem = null;
    // reset property panel
    STATE_PropertyPanelSet(await createBoardPanel());
  }

  const [STATE_PropertyPanel, STATE_PropertyPanelSet] = React.useState(<div></div>);

  React.useEffect(() => {
    const initializeSelection = async () => {
      selectItems(await miro.board.getSelection());
    }
    initializeSelection();
  }, []);

  const selectItems = async (items) => {

    await rebuildCache();

    let cachedItems = [];

    for (let i = 0; i < items.length; ++i) {

      console.log('selected ', items[i].type, ': ', items[i].id, ' ', stringify(mapCenterToTopLeft(items[i]), 0));

      let cachedItem = extendedItemOf(items[i]);
      if (cachedItem)
        cachedItems.push(cachedItem);
    }

    for (let item of await miro.board.get({ type: 'frame' })) {
      console.log('frame ', item.id);
    }

    STATE_PropertyPanelSet(<div></div>);
    if (cachedItems.length === 0) {
      SelectedItem = null;
      STATE_PropertyPanelSet(await createBoardPanel());
    }
    else {
      // handle groups or frames first, then leaf items
      for (let item of cachedItems) {
        if (item.type === 'group' || item.type === 'frame') {
          SelectedItem = item;
          STATE_PropertyPanelSet(await createPropertyPanel(SelectedItem));
          return;
        }
      }
      SelectedItem = cachedItems[0];

      // if ('label' in SelectedItem.metadata
      //   || 'line' in SelectedItem.metadata) {
      //   await miro.board.deselect({ id: SelectedItem.baseItem.id });
      //   await miro.board.select({ id: SelectedItem.baseItem.parentId });
      //   return;
      // }
      STATE_PropertyPanelSet(await createPropertyPanel(SelectedItem));
    }
  }

  const onSelectionUpdate = async (event) => {
    selectItems(event.items);
  }

  const currentYear = new Date().getFullYear();

  const years = [];

  for (let year = currentYear; year < currentYear + 150; year++) {
    years.push(year);
  }

  // Event handler for when the selected start year changes
  // const handleStartYearChange = (e) => {
  //   const selectedYear = parseInt(e.target.value);
  //   let endValue = document.getElementById('yearEndSelect').value;
  //   if (endValue < selectedYear)
  //     document.getElementById('yearEndSelect').value = selectedYear;
  // };

  // Event handler for when the selected end year changes
  // const handleEndYearChange = (e) => {
  //   const selectedYear = parseInt(e.target.value);
  //   let startValue = document.getElementById('yearStartSelect').value;
  //   if (selectedYear < startValue)
  //     document.getElementById('yearStartSelect').value = selectedYear;
  // };

  const generateTextContent = (name) => {
    return '<p>' + name + '</p>'
  }

  const generateTextContentI = (name) => {
    return '<p><i>' + name + '</i></p>'
  }

  const generateTextContentB = (name) => {
    return '<p><strong>' + name + '</strong></p>'
  }

  const generateTextContentBI = (name) => {
    return '<p><strong><i>' + name + '</i></strong></p>'
  }

  class TimelineBuildData {
    constructor(frame, duration, durationToUnitRatio, categoriesHeight) {
      const framePrevGeom = frame ? mapCenterToTopLeft(frame) : { x: 0, y: 0 };
      this.categoriesHeight = categoriesHeight;
      this.lineWidth = duration * durationToUnitRatio;
      this.lineHeight = 4 * 75;
      this.labelWidth = 1250;
      this.labelHeight = 300;
      this.dateEventMinWidth = DateEventWidth;
      this.dateEventHeight = DateEventHeight;
      this.contentWidth = this.lineWidth + CategoryLabelWidth + CategoryPadding.left + CategoryPadding.right + this.dateEventMinWidth;
      this.contentHeight = this.labelHeight + this.lineHeight + CategorySpacing + this.categoriesHeight;
      this.frameGeom = {
        x: framePrevGeom.x,
        y: framePrevGeom.y,
        width: this.contentWidth + TimelinePadding.left + TimelinePadding.right,
        height: this.contentHeight + TimelinePadding.top + TimelinePadding.bottom
      };
      this.frameGeomCenter = mapTopLeftToCenter(this.frameGeom);

      this.lineGeom = {
        x: this.frameGeom.x + TimelinePadding.left + CategoryLabelWidth + CategoryPadding.left + this.dateEventMinWidth / 2,
        y: this.frameGeom.y + TimelinePadding.top + this.labelHeight + this.lineHeight,
        width: this.lineWidth,
        height: this.lineHeight
      };
      this.lineGeomCenter = mapTopLeftToCenter(this.lineGeom);

      this.labelGeom = {
        x: this.lineGeom.x - this.labelWidth / 2,
        y: this.lineGeom.y - this.labelHeight - this.lineHeight,
        width: this.labelWidth,
        height: this.labelHeight
      };

      this.labelGeomCenter = mapTopLeftToCenter(this.labelGeom);

      this.firstCategoryGeom = {
        x: this.frameGeom.x + TimelinePadding.left,
        y: this.frameGeom.y + TimelinePadding.top + this.lineHeight + this.labelHeight + CategorySpacing,
        width: this.frameGeom.width - TimelinePadding.left - TimelinePadding.right,
        height: DateEventHeight + CategoryPadding.top + CategoryPadding.bottom
      };

      this.firstCategoryGeomCenter = mapTopLeftToCenter(this.firstCategoryGeom);

      this.categoryFrameGeom = { ...this.firstCategoryGeom };
      this.categoryFrameGeom.y += categoriesHeight;

      this.dateEventY = this.categoryFrameGeom.y + CategoryPadding.top;

      this.dateEventPanelGeom = { ...this.categoryFrameGeom };
      this.dateEventPanelGeom.x += CategoryLabelWidth;
      this.dateEventPanelGeom.width -= CategoryLabelWidth;

      this.categoryLabelGeom = { ...this.categoryFrameGeom };
      this.categoryLabelGeom.width = CategoryLabelWidth;
    }
  }

  const createTimeline = async () => {

    // Get selected year from the combobox
    var start = 2024; // document.getElementById("yearStartSelect").value;
    var end = 2150; // document.getElementById("yearEndSelect").value;
    var name = 'Untitled Timeline'; // document.getElementById("title").value

    var duration = end - start;

    var buildData = new TimelineBuildData(null, duration, DurationToUnitRatio, 0);

    const timelineFrame = await miro.board.createFrame({
      title: '',
      style: {
        fillColor: '#ffffff',
      },
      x: buildData.frameGeomCenter.x, // Default value: horizontal center of the board
      y: buildData.frameGeomCenter.y, // Default value: vertical center of the board
      width: buildData.frameGeomCenter.width,
      height: buildData.frameGeomCenter.height,
    });

    const labelText = await miro.board.createText({
      content: generateTextContentBI(name),
      style: {
        color: '#888888', // Default value: #1a1a1a (black)
        fillColor: 'transparent', // Default value: transparent (no fill)
        fillOpacity: 1, // Default value: 1 (solid color)
        fontFamily: 'fredoka one', // Default font type for the text
        fontSize: 144, // Default font size
        textAlign: 'left', // Default alignment: left
      },
      x: buildData.labelGeomCenter.x,
      y: buildData.labelGeomCenter.y,
      width: buildData.labelGeomCenter.width,
      height: buildData.labelGeomCenter.height,
      // 'height' is calculated automatically, based on 'width'
    });

    await labelText.setMetadata('label', name);
    let labelTextEx = makeExtendedItem(labelText, { metadata: { label: name } });
    Cache.itemExs.push(labelTextEx);

    const startYearShape = await miro.board.createShape({
      content: '',
      x: buildData.lineGeom.x + 4,
      y: buildData.lineGeom.y,
      height: 8,
      width: 8,
      style: {
        borderOpacity: 0,
      }
    });

    await startYearShape.setMetadata('startYear', start);
    let startYearShapeEx = makeExtendedItem(startYearShape, { metadata: { startYear: start } });
    Cache.itemExs.push(startYearShapeEx);

    const endYearShape = await miro.board.createShape({
      content: '',
      x: buildData.lineGeom.x + buildData.lineWidth + 4,
      y: buildData.lineGeom.y,
      height: 8,
      width: 8,
      style: {
        borderOpacity: 0,
      }
    });

    await endYearShape.setMetadata('endYear', end);
    let endYearShapeEx = makeExtendedItem(endYearShape, { metadata: { endYear: end } });
    Cache.itemExs.push(endYearShapeEx);

    let lineConnector = await miro.board.createConnector({
      shape: 'straight',
      style: {
        startStrokeCap: 'diamond',
        endStrokeCap: 'stealth',
        // strokeStyle: 'dashed',
        strokeColor: '#333333', // Magenta
        strokeWidth: 5,
      },
      // Set the start point of the connector.
      start: {
        item: startYearShape.id,
        // Set a point on the border of the 'start' shape to mark the start point of the connector.
        position: {
          // Horizontal: right
          x: 0,
          // Vertical: middle
          y: 0.5,
        },
      },
      // Set the end point of the connector.
      end: {
        item: endYearShape.id,
        position: {
          // Horizontal: right
          x: 0,
          // Vertical: middle
          y: 0.5,
        },
      },

    });
    await lineConnector.setMetadata('line', {});
    let lineConnectorEx = makeExtendedItem(lineConnector, { metadata: { line: {} } });
    Cache.itemExs.push(lineConnectorEx);

    const dummyShape = await miro.board.createShape({
      content: '',
      x: timelineFrame.x,
      y: timelineFrame.y,
      height: 8,
      width: 8,
      style: {
        borderOpacity: 0,
        fillOpacity: 0,
      }
    });
    await dummyShape.setMetadata('timeline', timelineFrame.id);
    await dummyShape.setMetadata('dummy', timelineFrame.id);
    let dummyShapeEx = makeExtendedItem(dummyShape, { metadata: { timeline: timelineFrame.id, dummy: timelineFrame.id } });
    Cache.itemExs.push(dummyShapeEx);

    const timelineItems = [lineConnector, startYearShape, endYearShape, dummyShape];
    const timelineGroup = await miro.board.group({ items: timelineItems });

    let timelineFrameEx = makeExtendedItem(timelineFrame, {
      metadata: {},
      categoryGroups: [],
      dateEventShapes: [],
      yearTexts: [],
      labelText: labelTextEx,
      lineConnector: lineConnectorEx,
      startYearShape: startYearShapeEx,
      endYearShape: endYearShapeEx,
      dummy: dummyShapeEx
    });
    Cache.itemExs.push(timelineFrameEx);

    labelTextEx['parent'] = timelineFrameEx;
    lineConnectorEx['parent'] = timelineFrameEx;
    startYearShapeEx['parent'] = timelineFrameEx;
    endYearShapeEx['parent'] = timelineFrameEx;
    Cache.timelineFrames.push(timelineFrameEx);

    await timelineFrame.add(timelineGroup);
    await timelineFrame.add(labelText);

    await updateTimelineFrameGeometry(timelineFrameEx);
  };

  const updateLabel = async (label, name, bold, italic) => {

    if (bold && italic)
      label.content = generateTextContentBI(name);
    else if (bold)
      label.content = generateTextContentB(name);
    else if (italic)
      label.content = generateTextContentI(name);
    else
      label.content = generateTextContent(name);

    label.metadata.label = name;
    await label.setMetadata('label', name);
    await label.sync();
  };

  const getStartYear = (timelineFrame) => timelineFrame.startYearShape.metadata.startYear
  const getEndYear = (timelineFrame) => timelineFrame.endYearShape.metadata.endYear

  const updateTimelineStartYear = async (timelineFrame, year) => {
    timelineFrame.startYearShape.metadata.startYear = year;
    await timelineFrame.startYearShape.setMetadata('startYear', year);
    await updateTimelineFrameGeometry(timelineFrame);
  }
  const updateTimelineEndYear = async (timelineFrame, year) => {
    timelineFrame.endYearShape.metadata.endYear = year;
    await timelineFrame.endYearShape.setMetadata('endYear', year);
    await updateTimelineFrameGeometry(timelineFrame);
  }

  const clampYear = (timelineFrame, year) => {

    const start = getStartYear(timelineFrame);
    const end = getEndYear(timelineFrame);

    if (year < start)
      year = start;
    if (year > end)
      year = end;

    return year;
  }

  const updateDateEventYear = async (dateEventShape, year) => {

    year = clampYear(dateEventShape.parent, year);
    let endYear = year + dateEventShape.metadata.dateEvent.duration;
    endYear = clampYear(dateEventShape.parent, endYear);
    dateEventShape.metadata.dateEvent.duration = endYear - year;
    dateEventShape.metadata.dateEvent.year = year;
    await updateDateEventShape(dateEventShape);
  }

  const updateDateEventDuration = async (dateEventShape, duration) => {

    let year = dateEventShape.metadata.dateEvent.year;
    let endYear = year + duration;

    endYear = clampYear(dateEventShape.parent, endYear);

    dateEventShape.metadata.dateEvent.duration = endYear - year;
    await updateDateEventShape(dateEventShape);
  }

  const updateDateEventShape = async (dateEventShape) => {

    const timelineFrame = dateEventShape.parent;

    let currLevel = dateEventShape.metadata.level;
    let currY = mapCenterToTopLeft(dateEventShape).y;

    let baseLevel = currLevel;
    let baseY = currY;

    while (baseLevel != 0) {
      baseY -= DateEventHeight + DateEventSpacing;
      baseLevel--;
    }

    const year = dateEventShape.metadata.dateEvent.year;
    const duration = dateEventShape.metadata.dateEvent.duration;

    const yearText = await getOrCreateYearText(timelineFrame, year);

    const endYearText = await getOrCreateYearText(timelineFrame, year + duration);

    let level = 0;
    let dateEventGeomCenter;
    while (true) {

      const dateEventGeom = {
        x: duration === 0 ? (yearText.x - DateEventWidth / 2) : yearText.x,
        y: baseY + level * (DateEventHeight + DateEventSpacing),
        width: duration === 0 ? DateEventWidth : Math.max(DateEventMinWidth, duration * DurationToUnitRatio),
        height: DateEventHeight
      };

      dateEventGeomCenter = mapTopLeftToCenter(dateEventGeom);

      if (!hasCollidingDateEventShape(dateEventShape.categoryGroup, dateEventGeomCenter, level, dateEventShape))
        break;

      level++;
    }

    // update level
    dateEventShape.metadata.level = level;

    await dateEventShape.setMetadata('dateEvent', dateEventShape.metadata.dateEvent);
    await dateEventShape.setMetadata('level', dateEventShape.metadata.level);

    // update frame geometry (to prepare potential space for the date event which changed)
    const index = getCategoryGroupIndex(dateEventShape.categoryGroup);
    const offsetY = computeCategoryGroupOffsetYAtIndex(dateEventShape.parent, index);

    await updateTimelineFrameGeometry(dateEventShape.parent, index, offsetY);

    ASSERT('dummy' in dateEventShape);

    const dummy = dateEventShape.dummy;
    // update the date event shape geometry
    dateEventShape.x = dateEventGeomCenter.x;
    dateEventShape.y = dateEventGeomCenter.y;
    dateEventShape.width = dateEventGeomCenter.width;
    dateEventShape.height = dateEventGeomCenter.height;
    if (duration === 0)
      dateEventShape.shape = 'round_rectangle';
    else
      dateEventShape.shape = 'rectangle';
    await dateEventShape.sync();
    dummy.x = dateEventGeomCenter.x;
    dummy.y = dateEventGeomCenter.y;
    dummy.width = dateEventGeomCenter.width;
    dummy.height = dateEventGeomCenter.height;
    await dummy.sync();
  }


  // CATEGORY

  const getChildrenWithMetadata = (parent, metadata) => {
    let filtered = [];
    if ('children' in parent)
      for (let child of parent.children) {
        if ('getMetadata' in child.metadata !== undefined
          && metadata in child.metadata) {
          filtered.push(child);
        }
      }
    else
      for (let child of parent.items) {
        if ('getMetadata' in child.metadata !== undefined
          && metadata in child.metadata) {
          filtered.push(child);
        }
      }

    return filtered;
  }

  const getChildWithMetadata = (parent, metadata) => {
    const [child] = getChildrenWithMetadata(parent, metadata);
    return child;
  }

  const getChildrenOfType = (parent, type) => {
    let result = [];
    for (let child of parent.children) {
      if (child.type === type)
        result.push(child);
    }
    return result;
  }
  const getChildOfType = (parent, type) => {
    const [child] = getChildrenOfType(parent, type);
    return child;
  }

  const getLabel = (frameOrGroup) => getChildWithMetadata(frameOrGroup, 'label');
  const getDateEventPanel = (categoryGroup) => getChildWithMetadata(categoryGroup, "dateEventPanel");

  const getCategory = (categoryGroup) => {
    for (let item of categoryGroup.items) {
      if (item.metadata && 'category' in metadata) {
        return item.metadata.category;
      }
    }
    return -1;
  };

  const getCategoryGroupIndex = (categoryGroup) => {
    const timelineFrame = categoryGroup.parent;
    const groups = timelineFrame.categoryGroups;
    for (let i = 0; i < groups.length; ++i)
      if (groups[i].id === categoryGroup.id)
        return i;
    alert("category group not found in timeline frame, there is a bug somewhere");
    return -1;
  }

  const getDateEventShapesForYear = (timelineFrame, year) => {

    let result = [];
    for (let dateEventShape of timelineFrame.dateEventShapes) {
      let dateEvent = dateEventShape.metadata.dateEvent;
      let dateEventYear = dateEvent.year;
      let dateEventEndYear = dateEvent.year + dateEvent.duration;
      if (year >= dateEventYear && year <= dateEventEndYear) {
        result.push(dateEventShape);
      }
    }
    return result;
  }
  const mapTopLeftToCenter = (item) => {
    return {
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
      width: item.width,
      height: item.height
    };
  }
  const mapCenterToTopLeft = (item) => {
    return {
      x: item.x - item.width / 2,
      y: item.y - item.height / 2,
      width: item.width,
      height: item.height
    };
  }

  const removeDateEventShapeUnusedLevels = async (categoryGroup) => {
    if (categoryGroup.dateEventShapes.length === 0)
      return 0;
    let maxLevel = getCategoryMaxDateEventShapeLevel(categoryGroup);
    let perLevelDateEventShapes = new Array(maxLevel + 1);
    for (let i = 0; i < perLevelDateEventShapes.length; ++i) {
      perLevelDateEventShapes[i] = [];
    }
    for (let dateEventShape of categoryGroup.dateEventShapes) {
      perLevelDateEventShapes[dateEventShape.metadata.level].push(dateEventShape);
    }

    let removedCount = 0;
    for (let dateEventShapes of perLevelDateEventShapes) {
      if (dateEventShapes.length == 0)
        removedCount++;
      else if (removedCount) {
        for (let dateEventShape of dateEventShapes) {
          dateEventShape.metadata.level -= removedCount;
          dateEventShape.setMetadata('level', dateEventShape.metadata.level);
        }
      }
    }

    if (removedCount === 0)
      return 0;

    let reRemovedCount = await removeDateEventShapeUnusedLevels(categoryGroup);
    // no level should be missing
    if (reRemovedCount !== 0) {
      debugger;
    }

    return removedCount;
  }

  const removeUnusedYearTexts = async (timelineFrame) => {
    let yearTexts = [...timelineFrame.yearTexts];
    for (let yearText of yearTexts) {
      if (findDateEventShapesForYear(timelineFrame, yearText.metadata.year).length === 0) {
        timelineFrame.yearTexts = timelineFrame.yearTexts.filter(item => item !== yearText);
        console.log('remove year text ', yearText.metadata.year);
        await destroyItem(yearText);
      }
    }
  }

  const updateCategoryGroupGeometry = async (timelineFrame, categoryGroup, offsetY, atLevel = 0) => {

    let start = timelineFrame.startYearShape.metadata.startYear;
    let end = timelineFrame.endYearShape.metadata.endYear;
    let duration = end - start;

    let labelShape = categoryGroup.labelShape;
    // let line = await getTimelineLine(timelineFrame);
    let dateEventPanel = categoryGroup.dateEventPanel;

    const dateEventShapes = categoryGroup.dateEventShapes;

    let buildData = new TimelineBuildData(timelineFrame, duration, DurationToUnitRatio, offsetY);

    await removeDateEventShapeUnusedLevels(categoryGroup);

    await removeUnusedYearTexts(timelineFrame);

    for (let dateEventShape of dateEventShapes) {
      if (dateEventShape.metadata.level >= atLevel) {
        const yearText = findTimelineYearText(timelineFrame, dateEventShape.metadata.dateEvent.year);
        const duration = dateEventShape.metadata.dateEvent.duration;
        const dateEventGeom = {
          x: duration === 0 ? (yearText.x - DateEventWidth / 2) : yearText.x,
          y: buildData.dateEventY + dateEventShape.metadata.level * DateEventHeight,
          width: duration === 0 ? DateEventWidth : Math.max(DateEventWidth, duration * DurationToUnitRatio),
          height: DateEventHeight
        };

        const dateEventGeomCenter = mapTopLeftToCenter(dateEventGeom);
        dateEventShape.x = dateEventGeomCenter.x;
        dateEventShape.y = dateEventGeomCenter.y;
        dateEventShape.width = dateEventGeomCenter.width;
        dateEventShape.height = dateEventGeomCenter.height;
        await dateEventShape.sync();

        ASSERT('dummy' in dateEventShape);
        let dummy = dateEventShape.dummy;
        dummy.x = dateEventGeomCenter.x;
        dummy.y = dateEventGeomCenter.y;
        dummy.width = dateEventGeomCenter.width;
        dummy.height = dateEventGeomCenter.height;
        await dummy.sync();
      }
    }

    let dateEventPanelGeom = { ...buildData.dateEventPanelGeom };
    dateEventPanelGeom.height = computeCategoryGroupHeight(categoryGroup);
    let dateEventPanelGeomCenter = mapTopLeftToCenter(dateEventPanelGeom);

    dateEventPanel.x = dateEventPanelGeomCenter.x;
    dateEventPanel.y = dateEventPanelGeomCenter.y;
    dateEventPanel.width = dateEventPanelGeomCenter.width;
    dateEventPanel.height = dateEventPanelGeomCenter.height;

    const dummy = dateEventPanel.dummy;
    dummy.x = dateEventPanelGeomCenter.x;
    dummy.y = dateEventPanelGeomCenter.y;
    dummy.width = dateEventPanelGeomCenter.width;
    dummy.height = dateEventPanelGeomCenter.height;

    let labelGeom = { ...buildData.categoryLabelGeom };
    labelGeom.height = dateEventPanelGeom.height;
    let labelGeomCenter = mapTopLeftToCenter(labelGeom);

    labelShape.x = labelGeomCenter.x;
    labelShape.y = labelGeomCenter.y;
    labelShape.width = labelGeomCenter.width;
    labelShape.height = labelGeomCenter.height;

    await dateEventPanel.sync();
    await dummy.sync();
    await labelShape.sync();

    return offsetY + CategorySpacing + dateEventPanelGeomCenter.height;
  }

  const updateTimelineFrameGeometry = async (timelineFrame, atCategoryGroupIndex = 0, atOffsetY = 0) => {
    let categoryGroups = timelineFrame.categoryGroups;
    let categoriesHeight = computeCategoryGroupsHeight(timelineFrame);

    let startShape = timelineFrame.startYearShape;
    let endShape = timelineFrame.endYearShape;
    let lineConnector = timelineFrame.lineConnector;
    let start = startShape.metadata.startYear;
    let end = endShape.metadata.endYear;
    let duration = end - start;

    let buildData = new TimelineBuildData(timelineFrame, duration, DurationToUnitRatio, categoriesHeight);

    startShape.x = buildData.lineGeom.x + 4;

    let newEndShapeX = buildData.lineGeom.x + buildData.lineWidth + 4;

    let isIncreasing = buildData.frameGeomCenter.width >= timelineFrame.width || buildData.frameGeomCenter.height >= timelineFrame.height;

    endShape.x = newEndShapeX;

    timelineFrame.x = buildData.frameGeomCenter.x;
    timelineFrame.y = buildData.frameGeomCenter.y;
    timelineFrame.width = buildData.frameGeomCenter.width;
    timelineFrame.height = buildData.frameGeomCenter.height;

    const updateCategoryGroups = async () => {
      let offsetY = atOffsetY;
      for (let i = atCategoryGroupIndex; i < categoryGroups.length; ++i)
        offsetY = await updateCategoryGroupGeometry(timelineFrame, categoryGroups[i], offsetY);
    }

    await startShape.sync();
    if (isIncreasing) {
      await timelineFrame.sync();
      await endShape.sync();
      await lineConnector.sync();
      await updateCategoryGroups();
    }
    else {
      await updateCategoryGroups();
      await endShape.sync();
      await lineConnector.sync();
      await timelineFrame.sync();
    }

  };

  const computeCategoryGroupHeight = (categoryGroup) => {
    let maxLevel = getCategoryMaxDateEventShapeLevel(categoryGroup);
    return (maxLevel + 1) * (DateEventHeight + DateEventSpacing) + CategoryPadding.top + CategoryPadding.bottom - DateEventSpacing;
  }

  const computeCategoryGroupsHeight = (timelineFrame) => {

    if (timelineFrame.categoryGroups.length === 0)
      return 0;
    let categoriesHeight = 0;
    for (let categoryGroup of timelineFrame.categoryGroups) {
      categoriesHeight += computeCategoryGroupHeight(categoryGroup) + CategorySpacing;
    }
    // categoriesHeight -= CategorySpacing;
    return categoriesHeight;
  }

  const _computeCategoryGroupOffsetYRecurse = (categoryGroups, index) => {
    if (index === 0)
      return 0;
    return _computeCategoryGroupOffsetYRecurse(categoryGroups, index - 1) + computeCategoryGroupHeight(categoryGroups[index - 1]) + CategorySpacing;
  }

  const computeCategoryGroupOffsetYAtIndex = (timelineFrame, index) => {
    if (index === 0)
      return 0;
    let categoryGroups = timelineFrame.categoryGroups;
    if (categoryGroups.length === 0)
      return 0;
    return _computeCategoryGroupOffsetYRecurse(categoryGroups, index);
  }

  const computeCategoryGroupOffsetY = (categoryGroup) => {
    const index = getCategoryGroupIndex(categoryGroup);
    return computeCategoryGroupOffsetY(categoryGroup.parent, index);
  }

  const createCategory = async (timelineFrame) => {

    let start = timelineFrame.startYearShape.metadata.startYear;
    let end = timelineFrame.endYearShape.metadata.endYear;
    let duration = end - start;

    const categoryGroups = timelineFrame.categoryGroups;

    let index = categoryGroups.length;

    let categoriesHeight = computeCategoryGroupsHeight(timelineFrame);

    let buildData = new TimelineBuildData(timelineFrame, duration, DurationToUnitRatio, categoriesHeight);

    let labelGeomCenter = mapTopLeftToCenter(buildData.categoryLabelGeom);

    const categoryHeight = DateEventHeight + CategoryPadding.top + CategoryPadding.bottom;
    let dateEventPanelGeom = { ...buildData.dateEventPanelGeom };
    dateEventPanelGeom.height = categoryHeight;
    let dateEventPanelGeomCenter = mapTopLeftToCenter(dateEventPanelGeom);

    let backgroundColor = CategoryPalette[timelineFrame.categoryGroups.length % CategoryPalette.length]; //'#0ca789';

    let name = 'Untitled Category'
    const dateEventPanel = await miro.board.createShape({
      content: '',
      style: {
        fillColor: backgroundColor,
      },
      x: dateEventPanelGeomCenter.x, // Default value: horizontal center of the board
      y: dateEventPanelGeomCenter.y, // Default value: vertical center of the board
      width: dateEventPanelGeomCenter.width,
      height: dateEventPanelGeomCenter.height, // temp
    });
    await dateEventPanel.setMetadata('dateEventPanel', {});

    let dateEventPanelEx = makeExtendedItem(dateEventPanel, { metadata: { dateEventPanel: {} }, parent: timelineFrame });
    Cache.itemExs.push(dateEventPanelEx);

    // prepare space for category
    timelineFrame.y += (categoryHeight + CategorySpacing) / 2;
    timelineFrame.height += categoryHeight + CategorySpacing;
    timelineFrame.sync();

    const dummyShape = await miro.board.createShape({
      content: '',
      x: dateEventPanelGeomCenter.x,
      y: dateEventPanelGeomCenter.y,
      width: 8,
      height: 8,
      style: {
        borderOpacity: 0,
        fillOpacity: 0,
      }
    });
    await dummyShape.setMetadata('category', { index: index });
    await dummyShape.setMetadata('dummy', dateEventPanel.id);

    let dummyShapeEx = makeExtendedItem(dummyShape, { metadata: { category: { index: index }, dummy: dateEventPanel.id }, parent: timelineFrame });
    Cache.itemExs.push(dummyShapeEx);
    dateEventPanelEx.dummy = dummyShapeEx;

    // Call myFunction with arguments
    let labelShape = await miro.board.createShape({
      content: generateTextContentB(name),
      x: labelGeomCenter.x,
      y: dateEventPanelGeomCenter.y,
      width: labelGeomCenter.width,
      height: labelGeomCenter.height,
      style: {
        borderOpacity: 0,
        color: '#eeeeee', // Default value: #1a1a1a (black)
        fillColor: backgroundColor,
        fillOpacity: 1, // Default value: 1 (solid color)
        fontSize: 96, // Default font size
        fontFamily: "fredoka one",
      }
    }
    );
    await labelShape.setMetadata('label', name);

    let labelShapeEx = makeExtendedItem(labelShape, { metadata: { label: name }, parent: timelineFrame });
    Cache.itemExs.push(labelShapeEx);

    const categoryItems = [labelShape, dateEventPanel, dummyShape];
    const categoryGroup = await miro.board.group({ items: categoryItems });

    let categoryGroupEx = makeExtendedItem(categoryGroup, {
      metadata: { label: name },
      parent: timelineFrame,
      items: [dateEventPanelEx, dummyShapeEx, labelShapeEx],
      dateEventShapes: [],
      dateEventPanel: dateEventPanelEx,
      labelShape: labelShapeEx,
    });
    Cache.itemExs.push(categoryGroupEx);

    dateEventPanelEx['group'] = categoryGroupEx;
    dummyShapeEx['group'] = categoryGroupEx;
    labelShapeEx['group'] = categoryGroupEx;


    Cache.categoryGroups.push(categoryGroupEx);
    timelineFrame.categoryGroups.push(categoryGroupEx);

    await timelineFrame.baseItem.add(categoryGroupEx);

    await updateTimelineFrameGeometry(timelineFrame);
  };

  const findTimelineYearText = (timelineFrame, year) => timelineFrame.yearTexts.find((yearText, _) => yearText.metadata.year === year);

  const findDateEventShapesForYear = (timelineFrame, year) => {
    let dateEventShapes = [];
    for (let categoryGroup of timelineFrame.categoryGroups) {
      dateEventShapes = dateEventShapes.concat(categoryGroup.dateEventShapes.filter(
        dateEventShape =>
          (year >= dateEventShape.metadata.dateEvent.year) && ((year - dateEventShape.metadata.dateEvent.year) <= dateEventShape.metadata.dateEvent.duration)
      ));
    }
    return dateEventShapes;
  }

  const isColliding = (obj1, obj2) => {
    const obj1HalfWidth = obj1.width / 2;
    const obj1HalfHeight = obj1.height / 2;
    const obj2HalfWidth = obj2.width / 2;
    const obj2HalfHeight = obj2.height / 2;

    const obj1Left = obj1.x - obj1HalfWidth;
    const obj1Right = obj1.x + obj1HalfWidth;
    const obj1Top = obj1.y - obj1HalfHeight;
    const obj1Bottom = obj1.y + obj1HalfHeight;

    const obj2Left = obj2.x - obj2HalfWidth;
    const obj2Right = obj2.x + obj2HalfWidth;
    const obj2Top = obj2.y - obj2HalfHeight;
    const obj2Bottom = obj2.y + obj2HalfHeight;

    return (
      obj1Left < obj2Right &&
      obj1Right > obj2Left &&
      obj1Top < obj2Bottom &&
      obj1Bottom > obj2Top
    );
  }

  const hasCollidingYearText = (timelineFrame, yearTextToTest, level) => {
    const yearTexts = timelineFrame.yearTexts;
    for (let yearText of yearTexts) {
      if (yearText.metadata.level === level) {
        if (isColliding(yearText, yearTextToTest))
          return true;
      }
    }
    return false;
  }

  const getOrCreateYearText = async (timelineFrame, year) => {

    const startYear = timelineFrame.startYearShape.metadata.startYear;

    let yearText = findTimelineYearText(timelineFrame, year);
    if (yearText !== undefined)
      return yearText;

    const durationFromStart = year - startYear;

    const buildData = new TimelineBuildData(timelineFrame, durationFromStart, DurationToUnitRatio, 0);

    let yearTextGeom = {};

    let level = 0;
    while (true) {
      yearTextGeom = {
        x: buildData.lineGeom.x + DurationToUnitRatio * durationFromStart,
        y: buildData.lineGeom.y - 100 - level * 75,
        width: 150,
        height: 75
      };
      if (!hasCollidingYearText(timelineFrame, yearTextGeom, level))
        break;
      level++;
    }

    yearText = await miro.board.createText({
      content: '' + year,
      style: {
        color: '#888888', // Default value: #1a1a1a (black)
        fillColor: 'transparent', // Default value: transparent (no fill)
        fillOpacity: 1, // Default value: 1 (solid color)
        fontFamily: 'fredoka one', // Default font type for the text
        fontSize: 48, // Default font size
        textAlign: 'center'
      },
      x: yearTextGeom.x,
      y: yearTextGeom.y,
      width: yearTextGeom.width,
      height: yearTextGeom.height
      // 'height' is calculated automatically, based on 'width'
    });
    // update cache
    let yearTextEx = makeExtendedItem(yearText, { metadata: { year: year, level: level }, parent: timelineFrame });
    Cache.itemExs.push(yearTextEx);
    timelineFrame.yearTexts.push(yearTextEx);
    Cache.yearTexts.push(yearTextEx);

    await yearText.setMetadata('year', year);
    await yearText.setMetadata('level', level);
    await timelineFrame.baseItem.add(yearText);

    return yearTextEx;
  }

  const hasCollidingDateEventShape = (categoryGroup, dateEventGeom, testedLevel, exceptThisOne = null) => {

    let dateEventShapes = categoryGroup.dateEventShapes;
    for (let dateEventShape of dateEventShapes) {
      if (dateEventShape === exceptThisOne)
        continue;
      const level = dateEventShape.metadata.level;
      if (level === testedLevel) {
        if (isColliding(dateEventShape, dateEventGeom))
          return true;
      }
    }
    return false;
  }

  const getCategoryMaxDateEventShapeLevel = (categoryGroup) => {

    let dateEventShapes = categoryGroup.dateEventShapes;
    let maxLevel = 0;
    for (let dateEventShape of dateEventShapes) {
      if (dateEventShape.metadata.level > maxLevel)
        maxLevel = dateEventShape.metadata.level;
    }
    return maxLevel;
  }

  const createDateEvent = async (categoryGroup) => {

    const index = getCategoryGroupIndex(categoryGroup);

    const name = 'New Event';

    const description = 'Description of a New Event';

    let offsetY = computeCategoryGroupOffsetYAtIndex(categoryGroup.parent, index);

    const timelineFrame = categoryGroup.parent;

    const buildData = new TimelineBuildData(timelineFrame, 0, DurationToUnitRatio, offsetY);

    const year = NewDateEventYear;

    const dateText = await getOrCreateYearText(timelineFrame, year);

    const duration = 0; // just here for consistency with the update* method (we have to not forget about duration in the process of building geom)

    let level = 0;
    let dateEventGeomCenter;
    while (true) {

      const dateEventGeom = {
        x: duration === 0 ? (dateText.x - buildData.dateEventMinWidth / 2) : dateText.x,
        y: buildData.dateEventY + level * buildData.dateEventHeight,
        width: duration === 0 ? buildData.dateEventMinWidth : Math.max(buildData.dateEventMinWidth, duration * DurationToUnitRatio),
        height: buildData.dateEventHeight
      };

      dateEventGeomCenter = mapTopLeftToCenter(dateEventGeom);

      if (!hasCollidingDateEventShape(categoryGroup, dateEventGeomCenter, level))
        break;

      level++;
    }

    const dateEventShape = await miro.board.createShape({
      content: generateTextContentB(name),
      x: dateEventGeomCenter.x,
      y: dateEventGeomCenter.y,
      width: dateEventGeomCenter.width,
      height: dateEventGeomCenter.height,
      shape: 'round_rectangle',
      style: {
        color: '#333333', // Default value: #1a1a1a (black)
        fillColor: '#eeeeee', // Default value: transparent (no fill)
        fillOpacity: 1.0, // Default value: 1 (solid color)
        fontFamily: 'fredoka one', // Default font type for the text
        fontSize: 32, // Default font size
        textAlign: 'center', // Default alignment: center
      }
    });
    const dummyShape = await miro.board.createShape({
      content: '',
      x: dateEventGeomCenter.x,
      y: dateEventGeomCenter.y,
      width: 8,
      height: 8,
      style: {
        fillOpacity: 0.0, // Default value: 1 (solid color)
        borderOpacity: 0.0,
      }
    });

    await dummyShape.setMetadata('dummy', dateEventShape.id);
    let dummyShapeEx = makeExtendedItem(dateEventShape, { metadata: { dummy: dateEventShape.id }, parent: timelineFrame });
    Cache.itemExs.push(dummyShapeEx);

    let dateEvent = { description: description, categoryGroupId: categoryGroup.id, year: year, duration: duration };

    const dateEventGroup = await miro.board.group({ items: [dateEventShape, dummyShape] });

    await timelineFrame.baseItem.add(dateEventGroup);

    await dateEventShape.setMetadata('dateEvent', dateEvent);
    await dateEventShape.setMetadata('label', name);
    await dateEventShape.setMetadata('level', level);

    let dateEventShapeEx = makeExtendedItem(dateEventShape, { metadata: { dateEvent: dateEvent, label: name, level: level }, parent: timelineFrame, categoryGroup: categoryGroup, dummy: dummyShapeEx });
    Cache.dateEventShapes.push(dateEventShapeEx);
    categoryGroup.dateEventShapes.push(dateEventShapeEx);
    Cache.itemExs.push(dateEventShapeEx);

    await updateTimelineFrameGeometry(timelineFrame, index, offsetY);
  }

  let Cache = undefined;

  const initTimelineFrameCache = (frame) => {
    frame['categoryGroups'] = [];
    frame['yearTexts'] = [];
    frame['dateEventShapes'] = [];
    frame['startYearShape'] = null;
    frame['endYearShape'] = null;
    frame['labelText'] = null;
  }
  const initCategoryGroupCache = (group) => {
    group['dateEventShapes'] = [];
    group['labelShape'] = null;
    group['dateEventPanel'] = null;
  }


  const printCache = () => {
    // let dump = []
    // for (let item of Cache.itemExs) {
    //   dump.push({ id: item.id, type: item.type });
    // }
    // console.log(stringify(dump));
    // console.log(" -------------------------- ");

    // for (let frame of Cache.timelineFrames) {
    //   console.log("timeline", frame.id);
    //   for (let categoryGroup of frame.categoryGroups) {
    //     console.log('  ', "categoryGroup", categoryGroup.id);
    //     console.log('     y:', categoryGroup.dateEventPanel.y);
    //     for (let dateEventShape of categoryGroup.dateEventShapes) {
    //       console.log('    ', "dateEventShape", dateEventShape.id);
    //     }
    //   }
    // }
  }

  const rebuildCache = async () => {

    Cache = {
      itemExs: [],
      timelineFrames: [],
      categoryGroups: [],
      dateEventShapes: [],
      yearTexts: []
    };

    let allItems = await miro.board.get({ type: ['group', 'shape', 'text', 'frame', 'connector'] });

    class ItemWithMetaData {
      constructor(item, metadata) {
        this.item = item;
        this.metadata = metadata;
      }
    }

    let allMetadata = [];

    const promisedMetaData = [];

    for (let item of allItems) {
      if (item.type == 'frame' || item.type == 'group')
        promisedMetaData.push(Promise.resolve({}));
      else
        promisedMetaData.push(item.getMetadata());
    }

    allMetadata = await Promise.all(promisedMetaData);

    for (let i = 0; i < allItems.length; ++i) {
      Cache.itemExs.push(makeExtendedItem(allItems[i], { metadata: allMetadata[i] }));
    }

    const itemExFromId = (id) => {
      for (let itemEx of Cache.itemExs) {
        if (itemEx.id === id)
          return itemEx;
      }
      return undefined;
    }

    // find timeline frames
    for (let frame of Cache.itemExs) {
      if (frame.type === 'frame') {
        frame['children'] = [];
        let isTimeline = false;
        for (let subItem of Cache.itemExs) {
          if (subItem.parentId === frame.id) {
            frame['children'].push(subItem);
            subItem['parent'] = frame;
            if (!isTimeline && ('timeline' in subItem.metadata)) {
              isTimeline = true;
              initTimelineFrameCache(frame);
              Cache.timelineFrames.push(frame);
            }
          }
        }
      }
    }

    // find category groups
    for (let group of Cache.itemExs) {
      if (group.type === 'group') {
        group['items'] = [];
        let isCategory = false;
        for (let subItem of Cache.itemExs) {
          if (subItem.groupId === group.id) {
            group.items.push(subItem);
            subItem['group'] = group;
            if (!isCategory && ('category' in subItem.metadata)) {
              isCategory = true;
              if (!('dateEventShapes' in group))
                group.dateEventShapes = [];
              Cache.categoryGroups.push(group);
            }
            if ('label' in subItem.metadata
              && subItem.type == 'shape') {
              if (('dateEvent' in subItem.metadata)) {
                // dateEvent shape
              }
              else
                group.labelShape = subItem;
            }
            else if ('dateEventPanel' in subItem.metadata)
              group.dateEventPanel = subItem;
          }
        }
        if (isCategory) {
          for (let timelineFrame of Cache.timelineFrames)
            if (group.items[0].parentId === timelineFrame.id) {
              timelineFrame.categoryGroups.push(group);
              group.parent = timelineFrame;
            }
        }
      }
    }

    // find category groups
    for (let shape of Cache.itemExs) {
      if (shape.type === 'shape') {

        if ('dummy' in shape.metadata) {
          let dummiedItem = itemExFromId(shape.metadata.dummy);
          ASSERT(dummiedItem !== undefined);
          dummiedItem.dummy = shape;
        }

        else if ('dateEvent' in shape.metadata) {
          Cache.dateEventShapes.push(shape);

          let addedToCategory = false;
          for (let categoryGroup of Cache.categoryGroups)
            if (shape.metadata.dateEvent.categoryGroupId === categoryGroup.id) {
              categoryGroup.dateEventShapes.push(shape);
              shape.categoryGroup = categoryGroup;
              addedToCategory = true;
              break;
            }
          ASSERT(addedToCategory);

          let addedToTimeline = false;
          for (let timelineFrame of Cache.timelineFrames)
            if (shape.parentId === timelineFrame.id) {
              timelineFrame.dateEventShapes.push(shape);
              addedToTimeline = true;
              break;
            }
          ASSERT(addedToTimeline);

        }
        else if ('startYear' in shape.metadata) {
          let addedToTimeline = false;
          for (let timelineFrame of Cache.timelineFrames)
            if (shape.parentId === timelineFrame.id) {
              timelineFrame.startYearShape = shape;
              addedToTimeline = true;
              break;
            }
          ASSERT(addedToTimeline);
        }
        else if ('endYear' in shape.metadata) {
          let addedToTimeline = false;
          for (let timelineFrame of Cache.timelineFrames)
            if (shape.parentId === timelineFrame.id) {
              timelineFrame.endYearShape = shape;
              addedToTimeline = true;
              break;
            }
          ASSERT(addedToTimeline);
        }
      }
    }

    // find category groups
    for (let text of Cache.itemExs) {
      if (text.type === 'text') {
        if ('year' in text.metadata) {
          Cache.yearTexts.push(text);
          let addedToTimeline = false;
          for (let timelineFrame of Cache.timelineFrames)
            if (text.parentId === timelineFrame.id) {
              timelineFrame.yearTexts.push(text);
              addedToTimeline = true;
              break;
            }
          ASSERT(addedToTimeline);
        }
        else
          if ('label' in text.metadata) {
            for (let timelineFrame of Cache.timelineFrames)
              if (text.parentId === timelineFrame.id)
                timelineFrame.labelText = text;
          }
      }
    }

    for (let connector of Cache.itemExs) {
      if (connector.type === 'connector') {
        for (let timelineFrame of Cache.timelineFrames)
          if (connector.parentId === timelineFrame.id)
            timelineFrame.lineConnector = connector;
      }
    }

    // sort vertically the category groups
    for (let timelineFrame of Cache.timelineFrames) {
      timelineFrame.categoryGroups.sort((grp0, grp1) => grp0.items[0].y - grp1.items[0].y);
    }

    printCache();

  }

  const extendedItemOf = (item) => {
    for (let itemEx of Cache.itemExs) {
      if (item.id == itemEx.id)
        return itemEx;
    }
    return undefined;
  }

  const makeExtendedItem = (item, extension) => {
    return {
      baseItem: item,
      ...item,
      ...extension,
      sync: async function () {
        // Copying back properties from object to copiedObject
        let changed = false;

        if ('x' in this.baseItem) {
          if (Number.isNaN(this.x) || Number.isNaN(this.y) || Number.isNaN(this.width) || Number.isNaN(this.height))
            debugger;
          if (this.baseItem.x !== this.x) {
            this.baseItem.x = this.x;
            changed = true;
          }
          if (this.baseItem.y !== this.y) {
            this.baseItem.y = this.y;
            changed = true;
          }
          if (this.baseItem.width !== this.width) {
            this.baseItem.width = this.width;
            changed = true;
          }
          if (this.baseItem.height !== this.height) {
            this.baseItem.height = this.height;
            changed = true;
          }
        }
        if ('content' in this.baseItem) {
          if (this.baseItem.content !== this.content) {
            {
              this.baseItem.content = this.content;
              changed = true;
            }
          }
        }
        if ('shape' in this.baseItem) {
          if (this.baseItem.shape !== this.shape) {
            {
              this.baseItem.shape = this.shape;
              changed = true;
            }
          }

        }
        if (changed)
          return await this.baseItem.sync();
      },
      setMetadata: async function (key, value) {
        return await this.baseItem.setMetadata(key, value);
      }
    }
  }

  const findTimelineFrame = (id) => Cache.timelineFrames.find((item, index) => item.id === id);
  const findCategoryGroup = (id) => Cache.categoryGroups.find((item, index) => item.id === id);
  const findDateEventShape = (id) => Cache.dateEventShapes.find((item, index) => item.id === id);
  const findYearText = (id) => Cache.yearTexts.find((item, index) => item.id === id);

  const createPropertyPanel = async (selectedItem) => {

    await rebuildCache();

    let itemEx = extendedItemOf(selectedItem);

    let timelineFrame = findTimelineFrame(selectedItem.id);

    if (timelineFrame)
      return await createTimelinePanel(timelineFrame);
    else {
      let categoryGroup = findCategoryGroup(selectedItem.id);
      if (categoryGroup) {
        return await createCategoryPanel(categoryGroup);
      }
      else {
        if (selectedItem.type == 'group') {
          let dateEventShape = findDateEventShape(selectedItem.items[0].id) || findDateEventShape(selectedItem.items[1].id);
          if (dateEventShape) {
            return await createDateEventPanel(dateEventShape);
          }
        }
        else {
          let yearText = findYearText(selectedItem.id);
          if (yearText) {
            return await createYearPanel(yearText);
          }
        }
      }

      return await createBoardPanel();
    }
  }

  const createDateEventPanel = (dateEventShape) => {

    let labelName = dateEventShape.metadata.label;

    return (
      <div className="property-panel">

        <div className="property-row">
          <label className="property-row-left" htmlFor="name">Name</label>
          <input className="property-row-right" id="name" type="text" defaultValue={labelName} onChange={(event) => updateLabel(dateEventShape, event.target.value, true, false)} />
        </div>

        <div className="property-row">
          <label className="property-row-left" htmlFor="yearStartSelect">Year</label>
          <select className="property-row-right" id="yearStartSelect" defaultValue={dateEventShape.metadata.dateEvent.year} onChange={(event) => { updateDateEventYear(dateEventShape, parseInt(event.target.value)); }}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="property-row">
          <label className="property-row-left" htmlFor="duration">Duration</label>
          <input className="property-row-right" id="name" type="number" min="0" defaultValue={dateEventShape.metadata.dateEvent.duration} onChange={(event) => updateDateEventDuration(dateEventShape, parseInt(event.target.value))} />
        </div>

        <DestroySelectionButton onClick={destroySelection} />

      </div>
    )
  }

  const createBoardPanel = () => {
    return (<a className="button button-primary" href="#" onClick={createTimeline}>
      Create Timeline
    </a>)
  }

  const createCategoryPanel = async (categoryGroup) => {

    let labelItem = categoryGroup.labelShape;
    let labelName = labelItem.metadata.label;

    let dateEventPanel = getDateEventPanel(categoryGroup);

    return (
      <div className="property-panel">
        <div className="property-row">
          <label className="property-row-left" htmlFor="name" >Name</label>
          <input className="property-row-right" id="name" type="text" defaultValue={labelName} onChange={(event) => updateLabel(labelItem, event.target.value, true, false)} />
        </div>
        <div className="property-row">
          <select className="property-row-left" id="yearStartSelect" defaultValue={NewDateEventYear} onChange={(event) => { NewDateEventYear = parseInt(event.target.value); }}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <a className="property-row-right button button-primary" id="addDateEvent" href="#" onClick={(event) => createDateEvent(categoryGroup)}>
            Add Date Event
          </a>
        </div>
        <DestroySelectionButton onClick={destroySelection} />
      </div>
    );
  }

  const createTimelinePanel = async (timelineFrame) => {

    const children = timelineFrame.children;
    let labelText = timelineFrame.labelText;
    let labelName = labelText.metadata.label;

    return (
      <div className="property-panel">

        <div className="property-row">
          <label className="property-row-left" htmlFor="name">Name</label>
          <input className="property-row-right" id="name" type="text" defaultValue={labelName} onChange={(event) => updateLabel(labelText, event.target.value, true, true)} />
        </div>

        <div className="property-row">
          <label className="property-row-left" htmlFor="yearStartSelect">Start Year</label>
          <select className="property-row-right" id="yearStartSelect" defaultValue={getStartYear(timelineFrame)} onChange={(event) => { updateTimelineStartYear(timelineFrame, event.target.value); }}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="property-row">
          <label className="property-row-left" htmlFor="yearEndSelect">End Year</label>
          <select className="property-row-right" id="yearEndSelect" defaultValue={getEndYear(timelineFrame)} onChange={(event) => { updateTimelineEndYear(timelineFrame, event.target.value); }} >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="property-row">
          <label className="property-row-left" htmlFor="categories">Categories</label>
          <a className="property-row-right button button-primary" id="categories" href="#" onClick={(event) => createCategory(timelineFrame)}>
            Add Category
          </a>
        </div>

        <DestroySelectionButton onClick={destroySelection} />

      </div>
    )
  }

  const createYearPanel = (yearText) => {
    return (
      <div className="property-panel">
        <DestroySelectionButton onClick={destroySelection} />
      </div>
    );
  }

  // By default, we display the global board panel as there is no selection

  // HTML template


  return (
    <div >
      {STATE_PropertyPanel && <div>{STATE_PropertyPanel}</div>}
      <AppCore callBack={onSelectionUpdate} />
    </div >

  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

console.log("render");
