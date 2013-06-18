'use strict';

var _ = require('lodash');
var jDataView = require('jDataView');
var TTFTables = require("./ttf_tables");

//sizes
var SIZE_OF = {
  HEADER: 12,
  TABLE_HEADER: 16
};

//various constants
var CONST = {
  VERSION: 0x10000
}

function TTF() {

  //get length of object using "length" property values of gives schema. It can be called recursively if schema has nested schemas.
  function getLength (object, schema) {
    var length = 0;
    _.forEach(schema, function (property) {
      if (_.isArray(property.value)) {
        _.forEach(object[property.name], function (elem) {
          length += getLength(elem, property.value);
        }, this)
      }
      else
        length += property.length;
    }, this);
    return length;
  }

  //write single value to buffer
  function addValue(view, value, length, signed) {
    if (value == undefined)
      value = 0;
    switch (length) {
      case 1:
        signed ? view.writeInt8(value) : view.writeUint8(value);
        break;
      case 2:
        signed ? view.writeInt16(value) : view.writeUint16(value);
        break;
      case 4:
        signed ? view.writeInt32(value) : view.writeUint32(value);
        break;
      case 8:
        signed ? view.writeInt64(value) : view.writeUint64(value);
        break;
    }
  }

  //write object to buffer
  function addObject(view, value, schema, offset) {
    var length = 0;
    _.forEach(schema, function (property) {
      if (_.isArray(property.value)) {
        _.forEach(value[property.name], function (elem) {
          length += addObject(view, elem, property.value, offset + '  ');
        }, this)
      }
      else
        addValue(view, _.isObject(value) ? value[property.name] : value, property.length, property.signed);
    }, this);
  }

  //returns object created by given schema. It can be called recursively if schema has nested schemas.
  function initData(schema) {
    var data = {};
    _.forEach(schema, function (field) {
      var property;
      //if array, add empty array to the table instance
      if (_.isArray(field.value)) {
        property = {};
        if (property.required) //single instance of array should be presented
          property.value = initTable(field.value);
        else
          property.value = [];
        property.createElement = function () {
          return initData(field.value)
        };
        property.add = function (value) {
          if (_.isArray(value))
            obj.value = _.union(obj.value, value);
          else
            obj.value.push(value);
        }
      }
      else
        property = field.value;
      data[field.name] = property;
    }, this);
    data.__defineGetter__('length', function () {
      return getLength(this, schema);
    });
    return data;
  }

  this.toBuffer = function () {
    var tableCount = TTFTables.length;
    var entrySelector = Math.floor(Math.log(tableCount, 2));
    var searchRange = Math.pow(2, entrySelector) * 16;
    var rangeShift = tableCount * 16;

    var bufferSize = SIZE_OF.HEADER + SIZE_OF.TABLE_HEADER * tableCount;
    var tableLengths = [];
    
    //calculate length for each table
    _.forEach(TTFTables, function (tableSchema) {
      var table = this.tables[tableSchema.name];
      var tableLength = getLength(table, tableSchema.schema);
      tableLengths.push(tableLength);
      bufferSize += tableLength;
    }, this);

    var buffer = new Buffer(bufferSize);
    var view = new jDataView.jDataView(buffer);

    //add TTF header
    view.writeInt32(CONST.VERSION);
    view.writeUint16(tableCount);
    view.writeUint16(searchRange);
    view.writeUint16(entrySelector);
    view.writeUint16(rangeShift);
    var tableOffset = SIZE_OF.HEADER + SIZE_OF.TABLE_HEADER * tableCount;

    //add table headers
    var i = 0;
    _.forEach(TTFTables, function (tableSchema) {
      var table = this.tables[tableSchema.name];
      var checkSum = 0; //TODO: calculate actial checksum
      view.writeUint32(tableSchema.innerName);
      view.writeUint32(checkSum);
      view.writeUint32(tableOffset);
      view.writeUint32(tableLengths[i]);
      tableOffset += tableLengths[i];
      i ++;
    }, this);

    //add table data
    _.forEach(TTFTables, function (tableSchema) {
      addObject(view, this.tables[tableSchema.name], tableSchema.schema, '  ');
    }, this);

    return buffer;
  }

  //initialization
  this.tables = {};
  _.forEach(TTFTables, function (table) {
    this.tables[table.name] = initData(table.schema);
  }, this);
}


module.exports = TTF;