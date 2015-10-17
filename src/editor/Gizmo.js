define(function (require, exports, module) {

  'use strict';

  var glm = require('lib/glMatrix');
  var Primitive = require('mesh/Primitive');

  var vec2 = glm.vec2;
  var vec3 = glm.vec3;
  var mat4 = glm.mat4;
  var quat = glm.quat;

  // configs colors
  var COLOR_X = vec3.fromValues(0.7, 0.2, 0.2);
  var COLOR_Y = vec3.fromValues(0.2, 0.7, 0.2);
  var COLOR_Z = vec3.fromValues(0.2, 0.2, 0.7);
  var COLOR_GREY = vec3.fromValues(0.4, 0.4, 0.4);
  var COLOR_SW = vec3.fromValues(0.8, 0.4, 0.2);

  // overall scale of the gizmo
  var GIZMO_SIZE = 0.08;
  // arrow
  var ARROW_LENGTH = 2.5;
  var ARROW_CONE_THICK = 6.0;
  var ARROW_CONE_LENGTH = 0.25;
  // thickness of tori and arrows
  var THICKNESS = 0.024;
  var THICKNESS_PICK = THICKNESS * 5.0;
  // radius of tori
  var ROT_RADIUS = 1.5;
  var SCALE_RADIUS = ROT_RADIUS * 1.3;
  // size of cubes
  var CUBE_SIDE = 0.35;
  var CUBE_SIDE_PICK = CUBE_SIDE * 1.2;

  // edit masks
  var TRANS_X = 1 << 0;
  var TRANS_Y = 1 << 1;
  var TRANS_Z = 1 << 2;
  var ROT_X = 1 << 3;
  var ROT_Y = 1 << 4;
  var ROT_Z = 1 << 5;
  var ROT_W = 1 << 6;
  var PLANE_XY = 1 << 7;
  var PLANE_XZ = 1 << 8;
  var PLANE_YZ = 1 << 9;
  var SCALE_X = 1 << 10;
  var SCALE_Y = 1 << 11;
  var SCALE_Z = 1 << 12;
  var SCALE_W = 1 << 13;

  var TRANS_XYZ = TRANS_X | TRANS_Y | TRANS_Z;
  var ROT_XYZ = ROT_X | ROT_Y | ROT_Z;
  var PLANE_XYZ = PLANE_XY | PLANE_XZ | PLANE_YZ;
  var SCALE_XYZW = SCALE_X | SCALE_Y | SCALE_Z | SCALE_W;

  var createGizmo = function (type, nbAxis) {
    return {
      _finalMatrix: mat4.create(),
      _baseMatrix: mat4.create(),
      _color: vec3.create(),
      _colorSelect: vec3.fromValues(1.0, 1.0, 0.0),
      _drawGeo: null,
      _pickGeo: null,
      _isSelected: false,
      _type: type !== undefined ? type : -1,
      _nbAxis: nbAxis !== undefined ? nbAxis : -1,
      _lastInter: [0.0, 0.0, 0.0],
      updateMatrix: function () {
        mat4.copy(this._drawGeo.getMatrix(), this._finalMatrix);
        mat4.copy(this._pickGeo.getMatrix(), this._finalMatrix);
      },
      updateFinalMatrix: function (mat) {
        mat4.mul(this._finalMatrix, mat, this._baseMatrix);
      }
    };
  };

  var Gizmo = function (main) {
    this._main = main;
    this._gl = main._gl;

    // trans arrow 1 dim
    this._transX = createGizmo(TRANS_X, 0);
    this._transY = createGizmo(TRANS_Y, 1);
    this._transZ = createGizmo(TRANS_Z, 2);

    // trans plane 2 dim
    this._planeXY = createGizmo(PLANE_XY);
    this._planeXZ = createGizmo(PLANE_XZ);
    this._planeYZ = createGizmo(PLANE_YZ);

    // scale cube 1 dim
    this._scaleX = createGizmo(SCALE_X, 0);
    this._scaleY = createGizmo(SCALE_Y, 1);
    this._scaleZ = createGizmo(SCALE_Z, 2);
    // scale cube 3 dim
    this._scaleW = createGizmo(SCALE_W);

    // rot arc 1 dim
    this._rotX = createGizmo(ROT_X, 0);
    this._rotY = createGizmo(ROT_Y, 1);
    this._rotZ = createGizmo(ROT_Z, 2);
    // full arc display
    this._rotW = createGizmo(ROT_W);

    // line helper
    this._lineHelper = Primitive.createLine2D(this._gl);
    this._lineHelper.setShader('FLAT');

    this._lastDistToEye = 0.0;
    this._isEditing = false;

    this._selected = null;
    this._pickables = [];

    // editing lines stuffs
    this._editLineOrigin = [0.0, 0.0, 0.0];
    this._editLineDirection = [0.0, 0.0, 0.0];
    this._editOffset = [0.0, 0.0, 0.0];

    // cached matrices when starting the editing operations
    this._editLocal = mat4.create();
    this._editTrans = mat4.create();
    this._editScaleRot = mat4.create();
    // same for inv
    this._editLocalInv = mat4.create();
    this._editTransInv = mat4.create();
    this._editScaleRotInv = mat4.create();

    this._initTranslate();
    this._initRotate();
    this._initScale();
    this._initPickables();
  };

  Gizmo.prototype = {
    _initPickables: function () {
      var pickables = this._pickables;
      pickables.push(this._transX._pickGeo);
      pickables.push(this._transY._pickGeo);
      pickables.push(this._transZ._pickGeo);
      pickables.push(this._rotX._pickGeo);
      pickables.push(this._rotY._pickGeo);
      pickables.push(this._rotZ._pickGeo);
      pickables.push(this._scaleX._pickGeo);
      pickables.push(this._scaleY._pickGeo);
      pickables.push(this._scaleZ._pickGeo);
      pickables.push(this._scaleW._pickGeo);
    },
    _createArrow: function (tra, axis, color) {
      var mat = tra._baseMatrix;
      mat4.rotate(mat, mat, Math.PI * 0.5, axis);
      mat4.translate(mat, mat, [0.0, ARROW_LENGTH * 0.5, 0.0]);
      vec3.copy(tra._color, color);

      tra._pickGeo = Primitive.createArrow(this._gl, THICKNESS_PICK, ARROW_LENGTH, ARROW_CONE_THICK * 0.4);
      tra._pickGeo._gizmo = tra;
      tra._drawGeo = Primitive.createArrow(this._gl, THICKNESS, ARROW_LENGTH, ARROW_CONE_THICK, ARROW_CONE_LENGTH);
      tra._drawGeo.setShader('FLAT');
    },
    _initTranslate: function () {
      var axis = [0.0, 0.0, 0.0];
      this._createArrow(this._transX, vec3.set(axis, 0.0, 0.0, -1.0), COLOR_X);
      this._createArrow(this._transY, vec3.set(axis, 0.0, 1.0, 0.0), COLOR_Y);
      this._createArrow(this._transZ, vec3.set(axis, 1.0, 0.0, 0.0), COLOR_Z);
    },
    _createCircle: function (rot, rad, color, radius, mthick) {
      radius = radius || ROT_RADIUS;
      mthick = mthick || 1.0;
      vec3.copy(rot._color, color);
      rot._pickGeo = Primitive.createTorus(this._gl, radius, THICKNESS_PICK * mthick, rad, 6, 64);
      rot._pickGeo._gizmo = rot;
      rot._drawGeo = Primitive.createTorus(this._gl, radius, THICKNESS * mthick, rad, 6, 64);
      rot._drawGeo.setShader('FLAT');
    },
    _initRotate: function () {
      this._createCircle(this._rotX, Math.PI, COLOR_X);
      this._createCircle(this._rotY, Math.PI, COLOR_Y);
      this._createCircle(this._rotZ, Math.PI, COLOR_Z);
      this._createCircle(this._rotW, Math.PI * 2, COLOR_GREY);
    },
    _createCube: function (sca, axis, color) {
      var mat = sca._baseMatrix;
      mat4.rotate(mat, mat, Math.PI * 0.5, axis);
      mat4.translate(mat, mat, [0.0, ROT_RADIUS, 0.0]);
      vec3.copy(sca._color, color);
      sca._pickGeo = Primitive.createCube(this._gl, CUBE_SIDE_PICK);
      sca._pickGeo._gizmo = sca;
      sca._drawGeo = Primitive.createCube(this._gl, CUBE_SIDE);
      sca._drawGeo.setShader('FLAT');
    },
    _initScale: function () {
      var axis = [0.0, 0.0, 0.0];
      this._createCube(this._scaleX, vec3.set(axis, 0.0, 0.0, -1.0), COLOR_X);
      this._createCube(this._scaleY, vec3.set(axis, 0.0, 1.0, 0.0), COLOR_Y);
      this._createCube(this._scaleZ, vec3.set(axis, 1.0, 0.0, 0.0), COLOR_Z);
      this._createCircle(this._scaleW, Math.PI * 2, COLOR_SW, SCALE_RADIUS, 2.0);
    },
    _updateArcRotation: (function () {
      var qTmp = quat.create();
      return function (eye) {
        // xyz arc
        qTmp[0] = eye[2];
        qTmp[1] = 0.0;
        qTmp[2] = -eye[0];
        qTmp[3] = 1.0 + eye[1];
        quat.normalize(qTmp, qTmp);
        mat4.fromQuat(this._rotW._baseMatrix, qTmp);
        mat4.fromQuat(this._scaleW._baseMatrix, qTmp);

        // x arc
        quat.rotateZ(qTmp, quat.identity(qTmp), Math.PI * 0.5);
        quat.rotateY(qTmp, qTmp, Math.atan2(-eye[1], -eye[2]));
        mat4.fromQuat(this._rotX._baseMatrix, qTmp);

        // y arc
        quat.rotateY(qTmp, quat.identity(qTmp), Math.atan2(-eye[0], -eye[2]));
        mat4.fromQuat(this._rotY._baseMatrix, qTmp);

        // z arc
        quat.rotateX(qTmp, quat.identity(qTmp), Math.PI * 0.5);
        quat.rotateY(qTmp, qTmp, Math.atan2(-eye[0], eye[1]));
        mat4.fromQuat(this._rotZ._baseMatrix, qTmp);
      };
    })(),
    _computeCenterGizmo: function (center) {
      var mesh = this._main.getMesh();
      center = center || [0.0, 0.0, 0.0];
      if (mesh) {
        vec3.copy(center, mesh.getCenter());
        vec3.transformMat4(center, center, mesh.getEditMatrix());
        vec3.transformMat4(center, center, mesh.getMatrix());
      }
      return center;
    },
    _updateMatrices: function () {
      var camera = this._main.getCamera();
      var trMesh = this._computeCenterGizmo();
      var eye = camera.computePosition();

      this._lastDistToEye = this._isEditing ? this._lastDistToEye : vec3.dist(eye, trMesh);
      var scaleFactor = this._lastDistToEye * GIZMO_SIZE / camera.getConstantScreen();

      var traScale = mat4.create();
      mat4.translate(traScale, traScale, trMesh);
      mat4.scale(traScale, traScale, [scaleFactor, scaleFactor, scaleFactor]);

      // manage arc stuffs
      this._updateArcRotation(vec3.normalize(eye, vec3.sub(eye, trMesh, eye)));

      this._transX.updateFinalMatrix(traScale);
      this._transY.updateFinalMatrix(traScale);
      this._transZ.updateFinalMatrix(traScale);

      this._rotX.updateFinalMatrix(traScale);
      this._rotY.updateFinalMatrix(traScale);
      this._rotZ.updateFinalMatrix(traScale);
      this._rotW.updateFinalMatrix(traScale);

      this._scaleX.updateFinalMatrix(traScale);
      this._scaleY.updateFinalMatrix(traScale);
      this._scaleZ.updateFinalMatrix(traScale);
      this._scaleW.updateFinalMatrix(traScale);
    },
    _drawGizmo: function (elt) {
      elt.updateMatrix();
      var drawGeo = elt._drawGeo;
      drawGeo.setFlatColor(elt._isSelected ? elt._colorSelect : elt._color);
      drawGeo.updateMatrices(this._main.getCamera());
      drawGeo.render(this._main);
    },
    _updateLineHelper: function (x1, y1, x2, y2) {
      var vAr = this._lineHelper.getVertices();
      var main = this._main;
      var width = main._canvas.width;
      var height = main._canvas.height;
      vAr[0] = ((x1 / width) * 2.0) - 1.0;
      vAr[1] = (((height - y1) / height)) * 2.0 - 1.0;
      vAr[3] = ((x2 / width) * 2.0) - 1.0;
      vAr[4] = (((height - y2) / height)) * 2.0 - 1.0;
      this._lineHelper.updateVertexBuffer();
    },
    _saveEditMatrices: function () {
      // mesh local matrix
      mat4.copy(this._editLocal, this._main.getMesh().getMatrix());

      // translation part
      var center = this._computeCenterGizmo();
      mat4.translate(this._editTrans, mat4.identity(this._editTrans), center);

      // rotation + scale part
      mat4.copy(this._editScaleRot, this._editLocal);
      this._editScaleRot[12] = this._editScaleRot[13] = this._editScaleRot[14] = 0.0;

      // precomputes the invert
      mat4.invert(this._editLocalInv, this._editLocal);
      mat4.invert(this._editTransInv, this._editTrans);
      mat4.invert(this._editScaleRotInv, this._editScaleRot);
    },
    _startRotateEdit: function () {
      var main = this._main;
      var camera = main.getCamera();

      // 3d origin (center of gizmo)
      var projCenter = [0.0, 0.0, 0.0];
      this._computeCenterGizmo(projCenter);
      vec3.copy(projCenter, camera.project(projCenter));

      // compute tangent direction and project it on screen
      var dir = this._editLineDirection;
      var sign = this._selected._nbAxis === 0 ? -1.0 : 1.0;
      var lastInter = this._selected._lastInter;
      vec3.set(dir, -sign * lastInter[2], -sign * lastInter[1], sign * lastInter[0]);
      vec3.transformMat4(dir, dir, this._selected._finalMatrix);
      vec3.copy(dir, camera.project(dir));

      vec2.normalize(dir, vec2.sub(dir, dir, projCenter));

      vec2.set(this._editLineOrigin, main._mouseX, main._mouseY);
    },
    _startTranslateEdit: function () {
      var main = this._main;
      var camera = main.getCamera();

      var origin = this._editLineOrigin;
      var dir = this._editLineDirection;

      // 3d origin (center of gizmo)
      this._computeCenterGizmo(origin);

      // 3d direction
      var nbAxis = this._selected._nbAxis;
      if (nbAxis !== -1) // if -1, we don't care about dir vector
        vec3.set(dir, 0.0, 0.0, 0.0)[nbAxis] = 1.0;
      vec3.add(dir, origin, dir);

      // project on canvas and get a 2D line
      vec3.copy(origin, camera.project(origin));
      vec3.copy(dir, camera.project(dir));

      vec2.normalize(dir, vec2.sub(dir, dir, origin));

      var offset = this._editOffset;
      offset[0] = main._mouseX - origin[0];
      offset[1] = main._mouseY - origin[1];
    },
    _startPlaneEdit: function () {},
    _startScaleEdit: function () {
      this._startTranslateEdit();
    },
    _updateRotateEdit: function () {
      var main = this._main;
      var mesh = main.getMesh();

      var origin = this._editLineOrigin;
      var dir = this._editLineDirection;

      var vec = [main._mouseX, main._mouseY, 0.0];
      vec2.sub(vec, vec, origin);
      var dist = vec2.dot(vec, dir);

      // helper line
      this._updateLineHelper(origin[0], origin[1], origin[0] + dir[0] * dist, origin[1] + dir[1] * dist);

      var angle = 7 * dist / Math.min(main._canvas.width, main._canvas.height);
      angle %= (Math.PI * 2);
      var nbAxis = this._selected._nbAxis;

      var mrot = mesh.getEditMatrix();
      mat4.identity(mrot);
      if (nbAxis === 0) mat4.rotateX(mrot, mrot, -angle);
      else if (nbAxis === 1) mat4.rotateY(mrot, mrot, -angle);
      else if (nbAxis === 2) mat4.rotateZ(mrot, mrot, -angle);

      this._scaleRotateEditMatrix(mrot);

      main.render();
    },
    _updateTranslateEdit: function () {
      var main = this._main;
      var camera = main.getCamera();
      var mesh = main.getMesh();

      var origin = this._editLineOrigin;
      var dir = this._editLineDirection;

      var vec = [main._mouseX, main._mouseY, 0.0];
      vec2.sub(vec, vec, origin);
      vec2.sub(vec, vec, this._editOffset);
      vec2.scaleAndAdd(vec, origin, dir, vec2.dot(vec, dir));

      // helper line
      this._updateLineHelper(origin[0], origin[1], vec[0], vec[1]);

      var near = camera.unproject(vec[0], vec[1], 0.0);
      var far = camera.unproject(vec[0], vec[1], 0.1);

      vec3.transformMat4(near, near, this._editTransInv);
      vec3.transformMat4(far, far, this._editTransInv);

      // intersection line line
      vec3.normalize(vec, vec3.sub(vec, far, near));

      var inter = [0.0, 0.0, 0.0];
      inter[this._selected._nbAxis] = 1.0;

      var a01 = -vec3.dot(vec, inter);
      var b0 = vec3.dot(near, vec);
      var det = Math.abs(1.0 - a01 * a01);

      var b1 = -vec3.dot(near, inter);
      inter[this._selected._nbAxis] = (a01 * b0 - b1) / det;

      vec3.transformMat4(inter, inter, this._editScaleRotInv);
      var edim = mesh.getEditMatrix();
      mat4.identity(edim);
      mat4.translate(edim, edim, inter);

      main.render();
    },
    _updatePlaneEdit: function () {},
    _updateScaleEdit: function () {
      var main = this._main;
      var mesh = main.getMesh();

      var origin = this._editLineOrigin;
      var dir = this._editLineDirection;
      var nbAxis = this._selected._nbAxis;

      var vec = [main._mouseX, main._mouseY, 0.0];
      if (nbAxis !== -1) {
        vec2.sub(vec, vec, origin);
        vec2.scaleAndAdd(vec, origin, dir, vec2.dot(vec, dir));
      }

      // helper line
      this._updateLineHelper(origin[0], origin[1], vec[0], vec[1]);

      var distOffset = vec3.len(this._editOffset);
      var inter = [1.0, 1.0, 1.0];
      var scaleMult = Math.max(-0.99, (vec3.dist(origin, vec) - distOffset) / distOffset);
      if (nbAxis === -1) {
        inter[0] += scaleMult;
        inter[1] += scaleMult;
        inter[2] += scaleMult;
      } else {
        inter[nbAxis] += scaleMult;
      }

      var edim = mesh.getEditMatrix();
      mat4.identity(edim);
      mat4.scale(edim, edim, inter);

      this._scaleRotateEditMatrix(edim);

      main.render();
    },
    _scaleRotateEditMatrix: function (edit) {
      mat4.mul(edit, this._editTrans, edit);
      mat4.mul(edit, edit, this._editTransInv);

      mat4.mul(edit, this._editLocalInv, edit);
      mat4.mul(edit, edit, this._editLocal);
    },
    addGizmoToScene: function (scene) {
      scene.push(this._transX._drawGeo);
      scene.push(this._transY._drawGeo);
      scene.push(this._transZ._drawGeo);
      scene.push(this._rotX._drawGeo);
      scene.push(this._rotY._drawGeo);
      scene.push(this._rotZ._drawGeo);
      scene.push(this._rotW._drawGeo);
      scene.push(this._scaleX._drawGeo);
      scene.push(this._scaleY._drawGeo);
      scene.push(this._scaleZ._drawGeo);
      scene.push(this._scaleW._drawGeo);
      return scene;
    },
    render: function () {
      this._updateMatrices();

      var type = this._isEditing && this._selected ? this._selected._type : -1;

      if (type & ROT_W) this._drawGizmo(this._rotW);

      if (type & TRANS_X) this._drawGizmo(this._transX);
      if (type & TRANS_Y) this._drawGizmo(this._transY);
      if (type & TRANS_Z) this._drawGizmo(this._transZ);

      if (type & ROT_X) this._drawGizmo(this._rotX);
      if (type & ROT_Y) this._drawGizmo(this._rotY);
      if (type & ROT_Z) this._drawGizmo(this._rotZ);

      if (type & SCALE_X) this._drawGizmo(this._scaleX);
      if (type & SCALE_Y) this._drawGizmo(this._scaleY);
      if (type & SCALE_Z) this._drawGizmo(this._scaleZ);
      if (type & SCALE_W) this._drawGizmo(this._scaleW);

      if (this._isEditing) this._lineHelper.render(this._main);
    },
    onMouseOver: function () {
      if (this._isEditing) {
        var type = this._selected._type;
        if (type & ROT_XYZ) this._updateRotateEdit();
        else if (type & TRANS_XYZ) this._updateTranslateEdit();
        else if (type & PLANE_XYZ) this._updatePlaneEdit();
        else if (type & SCALE_XYZW) this._updateScaleEdit();

        return true;
      }

      var main = this._main;
      var picking = main.getPicking();
      var mx = main._mouseX;
      var my = main._mouseY;
      var pickables = this._pickables;
      picking.intersectionMouseMeshes(pickables, mx, my);

      if (this._selected)
        this._selected._isSelected = false;
      var geo = picking.getMesh();
      if (!geo) {
        this._selected = null;
        return false;
      }

      this._selected = geo._gizmo;
      this._selected._isSelected = true;
      vec3.copy(this._selected._lastInter, picking.getIntersectionPoint());
      return true;
    },
    onMouseDown: function () {
      var sel = this._selected;
      if (!sel)
        return false;

      this._isEditing = true;
      var type = sel._type;
      this._saveEditMatrices();

      if (type & ROT_XYZ) this._startRotateEdit();
      else if (type & TRANS_XYZ) this._startTranslateEdit();
      else if (type & PLANE_XYZ) this._startPlaneEdit();
      else if (type & SCALE_XYZW) this._startScaleEdit();

      return true;
    },
    onMouseUp: function () {
      this._isEditing = false;
    }
  };

  module.exports = Gizmo;
});