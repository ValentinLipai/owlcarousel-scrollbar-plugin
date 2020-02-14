/**
 * Owl Carousel Scrollbar plugin
 * @author Mahbub Alam <makjoybd@gmail.com>
 * @since 2.0.0
 */

; (function ($, window, document, undefined) {

    "use strict";

    var o = {};

    var namespace = "scrollbar";
    var handleClass = "owl-scroll-handle";
    var progressBarClass = "owl-scroll-progress";
    var scrollbarClass = "owl-scrollbar";
    var draggingClass = "owl-scroll-handle-dragging";
    var draggedClass = "owl-scroll-handle-dragged";

    var dragInitEvents = 'touchstart.' + namespace + ' mousedown.' + namespace;
    var dragMouseEvents = 'mousemove.' + namespace + ' mouseup.' + namespace;
    var dragTouchEvents = 'touchmove.' + namespace + ' touchend.' + namespace;
    var clickEvent = 'click.' + namespace;

    var interactiveElements = ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'];

    // Save styles
    var holderProps = ['overflow', 'position'];
    var movableProps = ['position', 'webkitTransform', 'msTransform', 'transform', 'left', 'top', 'width', 'height'];

    var dragging = {
        released: 1,
        init: 0
    };

    var transform, gpuAcceleration;

    // Math shorthands
    var abs = Math.abs;
    var sqrt = Math.sqrt;
    var pow = Math.pow;
    var round = Math.round;
    var max = Math.max;
    var min = Math.min;

    // Feature detects
    (function () {
        var prefixes = ['', 'Webkit', 'Moz', 'ms', 'O'];
        var el = document.createElement('div');

        function testProp(prop) {
            for (var p = 0, pl = prefixes.length; p < pl; p++) {
                var prefixedProp = prefixes[p] ? prefixes[p] + prop.charAt(0).toUpperCase() + prop.slice(1) : prop;
                if (el.style[prefixedProp] != null) {
                    return prefixedProp;
                }
            }
        }

        // Global support indicators
        transform = testProp('transform');
        gpuAcceleration = testProp('perspective') ? 'translateZ(0) ' : '';
    }());

    var Scrollbar = function (carousel) {

        this.initialized = false;

        this._core = carousel;

        this.options = {};

        this._handlers = {
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.scrollbarType) {
                    initialize.call(this, e);
                }
            }, this),
            'refreshed.owl.carousel resized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.scrollbarType) {
                    update.call(this, e);
                }
            }, this),
            "translate.owl.carousel": $.proxy(function (e) {
                if (e.namespace && this._core.settings.scrollbarType) {
                    sync.call(this, e);
                }
            }, this),
            "drag.owl.carousel": $.proxy(function (e) {
                if (e.namespace && this._core.settings.scrollbarType) {
                    dragging.init = 1;
                    sync.call(this, e);
                }
            }, this),
            "dragged.owl.carousel": $.proxy(function (e) {
                if (e.namespace && this._core.settings.scrollbarType) {
                    dragging.init = 0;
                }
            }, this)
        }

        this.handle = $('<div>').addClass(handleClass);
        this.progressBar = $('<div>').addClass(progressBarClass);
        this.scrollBar = $('<div>').addClass(scrollbarClass).append($(this.handle));

        this.sbStyles = new StyleRestorer(this.scrollBar);
        this.handleStyles = new StyleRestorer(this.handle);
        this.progressStyles = new StyleRestorer(this.progressBar);

        this.sbSize = 0;
        this.progressSize = 0;
        this.handleSize = 100;

        this.count = 0;
        this.visible = 0;
        this.ratio = 1;
        this.animationSpeed = 0;

        this.hPos = {
            start: 0,
            end: 0,
            cur: 0,
            index: 0
        };

        this.Instance = this._core = carousel;
        this.options = $.extend(Scrollbar.Defaults, this._core.options);
        this._core.$element.on(this._handlers);

        this._dragHandler;

        o = this.options;
    }

    Scrollbar.Defaults = {
        scrollbarType: 'scroll',
        scrollDragThreshold: 3,
        scrollbarHandleSize: 10
    }


    function dragInit(event) {
        var isTouch = event.type === 'touchstart';
        var source = event.data.source;

        if (dragging.init || !isTouch && isInteractive(event.target)) {
            return;
        }

        if (!isTouch) {
            stopDefault(event);
        }

        unsetTransitionAnimation.call(this, event);

        dragging.released = 0;
        dragging.init = 0;
        dragging.$source = $(event.target);
        dragging.touch = isTouch;
        dragging.pointer = isTouch ? event.originalEvent.touches[0] : event;
        dragging.initX = dragging.pointer.pageX;
        dragging.initY = dragging.pointer.pageY;
        dragging.path = 0;
        dragging.delta = 0;
        dragging.locked = 0;
        dragging.pathToLock = 0;

        var obj = this;
        this._dragHandler = function (e) {
            dragHandler.call(obj, e);
        }
        $(document).on(isTouch ? dragTouchEvents : dragMouseEvents, this._dragHandler);

        $(this.handle).addClass(draggedClass);

    }

    /**
     * Handler for dragging scrollbar handle
     *
     * @param  {Event} event
     *
     * @return {Void}
     */
    function dragHandler(event) {
        dragging.released = event.type === 'mouseup' || event.type === 'touchend';
        dragging.pointer = dragging.touch ? event.originalEvent[dragging.released ? 'changedTouches' : 'touches'][0] : event;
        dragging.pathX = dragging.pointer.pageX - dragging.initX;
        dragging.pathY = dragging.pointer.pageY - dragging.initY;
        dragging.path = sqrt(pow(dragging.pathX, 2) + pow(dragging.pathY, 2));
        dragging.delta = dragging.pathX + this.hPos.cur;

        var current = 0;

        if (!dragging.released && dragging.path < 1) return;

        // We haven't decided whether this is a drag or not...
        if (!dragging.init) {
            // If the drag path was very short, maybe it's not a drag?
            if (dragging.path < o.scrollDragThreshold) {
                // If the pointer was released, the path will not become longer and it's
                // definitely not a drag. If not released yet, decide on next iteration
                return dragging.released ? dragEnd.call(this) : undefined;
            }
            else {
                // If dragging path is sufficiently long we can confidently start a drag
                // if drag is in different direction than scroll, ignore it
                if (abs(dragging.pathX) > abs(dragging.pathY)) {
                    dragging.init = 1;
                } else {
                    return dragEnd.call(this);
                }
            }
        }

        stopDefault(event);

        if (!dragging.locked && dragging.path > dragging.pathToLock) {
            dragging.locked = 1;
            dragging.$source.on(clickEvent, disableOneEvent);
        }

        if (dragging.released) {
            dragEnd.call(this);
        }

        switch (o.scrollbarType) {
            case "scroll":
                current = within(dragging.delta, this.hPos.start, this.hPos.end);
                if (transform) {
                    $(this.handle).css('transform', gpuAcceleration + 'translateX' + '(' + current + 'px)');
                } else {
                    $(this.handle).css('left', current + 'px');
                }

                break;
            case "progress":
                current = within(dragging.delta, this.hPos.start, this.hPos.end);
                $(this.progressBar).css('width', current + 'px');
                $(this.handle).css('left', current + 'px');
                break;
        }

        dragging.current = current;

        var index = round(dragging.current / this.ratio);

        if (index != this.hPos.index) {

            this.hPos.index = index;
            this.Instance.$element.trigger("to.owl.carousel", [index, this.animationSpeed, true]);
        }



    }

    /**
     * Stops dragging and cleans up after it.
     *
     * @return {Void}
     */
    function dragEnd() {
        dragging.released = true;
        $(document).off(dragging.touch ? dragTouchEvents : dragMouseEvents, this._dragHandler);
        
        $(this.handle).removeClass(draggedClass);

        setTimeout(function () {
            dragging.$source.off(clickEvent, disableOneEvent);
        });

        this.hPos.cur = dragging.current;

        dragging.init = 0;
    }

    /**
	 * Disables an event it was triggered on and unbinds itself.
	 *
	 * @param  {Event} event
	 *
	 * @return {Void}
	 */
    function disableOneEvent(event) {
        /*jshint validthis:true */
        stopDefault(event, 1);
        $(this).off(event.type, disableOneEvent);
    }

    /**
	 * Make sure that number is within the limits.
	 *
	 * @param {Number} number
	 * @param {Number} min
	 * @param {Number} max
	 *
	 * @return {Number}
	 */
    function within(number, min, max) {
        return number < min ? min : number > max ? max : number;
    }

    /**
	 * Saves element styles for later restoration.
	 *
	 * Example:
	 *   var styles = new StyleRestorer(frame);
	 *   styles.save('position');
	 *   element.style.position = 'absolute';
	 *   styles.restore(); // restores to state before the assignment above
	 *
	 * @param {Element} element
	 */
    function StyleRestorer(element) {
        var self = {};
        self.style = {};
        self.save = function () {
            if (!element || !element.nodeType) return;
            for (var i = 0; i < arguments.length; i++) {
                self.style[arguments[i]] = element.style[arguments[i]];
            }
            return self;
        };
        self.restore = function () {
            if (!element || !element.nodeType) return;
            for (var prop in self.style) {
                if (self.style.hasOwnProperty(prop)) element.style[prop] = self.style[prop];
            }
            return self;
        };
        return self;
    }

    /**
	 * Event preventDefault & stopPropagation helper.
	 *
	 * @param {Event} event     Event object.
	 * @param {Bool}  noBubbles Cancel event bubbling.
	 *
	 * @return {Void}
	 */
    function stopDefault(event, noBubbles) {
        event.preventDefault();
        if (noBubbles) {
            event.stopPropagation();
        }
    }

    /**
     * Check whether element is interactive.
     *
     * @return {Boolean}
     */
    function isInteractive(element) {
        return ~$.inArray(element.nodeName, interactiveElements);
    }

    /**
     * Calculate current position from item index
     * 
     * @param {int} index 
     */
    function calculateCurrentPosition() {

        var position = 0;
        var index = this.Instance.relative(this.Instance.current());

        if (index === 0) {
            position = 0;
        }
        else if (index < this.count - this.visible) {
            position = (this.ratio * index);
        }
        else {
            position = this.sbSize - this.progressSize;
        }

        return position;
    }

    /**
     * Calculate current size from item index
     * 
     * @param {int} index 
     */
    function calculateCurrentSize() {

        var size = 0;

        var index = this.Instance.relative(this.Instance.current());

        if (index < this.count - this.visible) {
            size = this.ratio * index;
        }
        else {
            size = this.sbSize;
        }

        return size;
    }

    function setTransitionAnimation(event) {
        $(this.handle).css({
            "transition": "all " + (this.animationSpeed / 1000) + "s ease-in-out"
        });
        $(this.handle).css({
            "transition": "all " + (this.animationSpeed / 1000) + "s ease-in-out"
        });
    }

    function unsetTransitionAnimation(event) {
        $(this.handle).css({
            "transition": ""
        });
        $(this.progressBar).css({
            "transition": ""
        });
    }

    /**
     * Initialize the plugin
     * 
     * injects the scrollbar and sets initial values 
     * and parameters for furture uses in synchronization
     * 
     * @param {Event} event 
     */

    function initialize(event) {

        if (this.initialized) {
            return;
        }

        var $element = this._core.$element;

        $element.append($(this.scrollBar));

        $(this.handle).css({
            cursor: 'pointer',
        });

        this.sbStyles.save.apply(this.sbStyles, holderProps);

        var obj = this;
        $(this.handle).on(dragInitEvents, { source: handleClass }, function (e) {
            dragInit.call(obj, e);
        });
        this.sbSize = $(this.scrollBar).outerWidth();

        this.count = event.item.count;
        this.visible = event.page.size;
        this.ratio = this.sbSize / (this.count - this.visible + 1);
        this.animationSpeed = this._core.options.smartSpeed;

        this.hPos.start = 0;
        this.hPos.cur = 0;

        if (o.scrollbarType === "progress") {

            $(this.scrollBar).prepend($(this.progressBar));

            this.progressSize = calculateCurrentSize.call(this, event.item.index);

            this.handleSize = $(this.handle).outerWidth();

            this.progressStyles.save.apply(this.handleStyles, movableProps);

            $(this.progressBar).width(this.progressSize);
        }
        else {
            this.handleStyles.save.apply(this.handleStyles, movableProps);
            $(this.handle).width(this.handleSize);
        }

        this.hPos.end = this.sbSize - this.handleSize;
        this.initialized = true;
    }

    /**
     * Synchronize scrollbar on item drag
     * 
     * Dragging the items in the carousel frame, clicking 
     * on the nav buttons or dots fires this function to 
     * synchronize the scrollbar handle porision or size
     * 
     * @param {Event} event 
     */
    function sync(event) {
        if (this.handle.length && dragging.init === 0) {

            setTransitionAnimation.call(this);

            switch (o.scrollbarType) {

                case "scroll":

                    var current = calculateCurrentPosition.call(this);

                    this.hPos.cur = current;

                    if (transform) {
                        $(this.handle).css('transform', gpuAcceleration + 'translateX' + '(' + current + 'px)');
                    } else {
                        $(this.handle).css('left', current + 'px');
                    }

                    break;
                case "progress":

                    var current = calculateCurrentSize.call(this);

                    this.hPos.cur = current;

                    $(this.progressBar).css('width', current + "px");
                    $(this.handle).css('left', current + 'px');

                    break;
            }
        }

    }

    /**
     * Recalculates scrollbar dimensions on resize or refresh
     * 
     * @param {Event} event
     * */
    function update(event) {
        this.sbSize = $(this.scrollBar).outerWidth();
        this.count = event.item.count;
        this.visible = event.page.size;
        this.ratio = this.sbSize / (this.count - this.visible + 1);
        this.animationSpeed = this._core.options.smartSpeed;

        if (o.scrollbarType === "progress") {
            this.progressSize = calculateCurrentSize.call(this, event.item.index);
            this.handleSize = $(this.handle).outerWidth();
            $(this.progressBar).width(this.progressSize);
        }
        else {
            $(this.handle).width(this.handleSize);
        }
        this.hPos.end = this.sbSize - this.handleSize;
    }
    Scrollbar.prototype.destroy = function () {
        var handler, property;

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins['Scrollbar'] = Scrollbar;

})(window.Zepto || window.jQuery, window, document);